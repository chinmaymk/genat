import type { Context, Message, AssistantMessage } from '@mariozechner/pi-ai';
import { ChannelManager, normalizeChannelName, type ChannelMessage } from './channel.ts';
import { logger } from '../logger';
import type { ILLMClient } from './llm-client';
import type { ToolRegistry } from './tool-registry';
import type { ChannelConfig } from './org-loader';
import type { TeamMemory } from './team-memory';
import { Mailbox } from './mailbox';

export interface RoleConfig {
  id: string;
  title: string;
  level: string;
  reportsTo: string;
  skills: string[];
  /** Tool names this role can use. If absent, no tools are available. */
  tools?: string[];
  model: { provider: string; pinned?: string };
  systemPrompt: string;
  /** Channel ids this role subscribes to (e.g. ["general", "engineering"]). If absent, subscribes to all. */
  channels?: string[];
}

export interface SkillConfig {
  id: string;
  name: string;
  tool: string;
  content: string;
}

export interface DmPayload {
  from: string;
  content: string;
  correlationId?: string;
}

type MailboxPayload =
  | { kind: 'channel'; msg: ChannelMessage }
  | { kind: 'dm'; dm: DmPayload };

export interface AgentContext {
  role: RoleConfig;
  skills: SkillConfig[];
  agentId: string;
  channels?: ChannelConfig[];
  llm: ILLMClient;
  tools: ToolRegistry;
  channelManager: ChannelManager;
  teamMemory: TeamMemory;
}

export class Agent {
  readonly id: string;
  private _role: RoleConfig;
  get role(): RoleConfig {
    return this._role;
  }
  private skills: SkillConfig[];
  private conversationHistory: Message[];
  private running: boolean;
  private log: ReturnType<typeof logger.child>;
  private _systemPrompt: string | null = null;
  private channels: ChannelConfig[];
  private llm: ILLMClient;
  private tools: ToolRegistry;
  private channelMgr: ChannelManager;
  private teamMemory: TeamMemory;
  private mailbox = new Mailbox<MailboxPayload>();
  /** Pending reply resolvers for the ask/reply pattern. Keyed by correlationId. */
  readonly pendingReplies = new Map<string, (reply: string) => void>();
  /** Set by Org to deliver DMs from this agent to another agent's mailbox. */
  _dmSender?: (targetAgentId: string, content: string, correlationId?: string) => void;
  /** Set per DM handling turn so the reply tool knows who to reply to. */
  _activeDmFrom?: string;

  constructor(context: AgentContext) {
    this.id = context.agentId;
    this._role = context.role;
    this.skills = context.skills;
    this.channels = context.channels ?? [];
    this.conversationHistory = [];
    this.running = false;
    this.log = logger.child({ agentId: this.id });
    this.llm = context.llm;
    this.tools = context.tools;
    this.channelMgr = context.channelManager;
    this.teamMemory = context.teamMemory;
  }

  private buildSystemPrompt(): string {
    if (this._systemPrompt) return this._systemPrompt;

    const parts: string[] = [
      `# ${this.role.title} (${this.id})`,
      '',
      this.role.systemPrompt,
    ];

    if (this.skills.length > 0) {
      parts.push('', '## Available Skills', '');
      for (const skill of this.skills) {
        parts.push(`### ${skill.name} (${skill.id})`, '', skill.content, '');
      }
    }

    if (this.channels.length > 0) {
      parts.push('', '## Channels', '');
      for (const ch of this.channels) {
        parts.push(`- **#${ch.name}**: ${ch.purpose}`);
      }
    }

    parts.push(
      '',
      '## Agent Identity',
      `Your agent id is: ${this.id}`,
      `Your role is: ${this.role.title}`,
      `You report to: ${this.role.reportsTo}`,
      '',
      '## Instructions',
      'Think step by step. Use tools to get work done and to reach out for help.',
      '',
      '## Message Handling Rules',
      '- You receive messages from channels you monitor and direct messages (DMs) from other agents.',
      '- For channel messages, you see the full thread context — respond to the most recent message.',
      '- Use post_message to reply in a channel thread (set threadId to the root message id).',
      '- If a message does not require action from you, respond with just the text "NO_ACTION" and nothing else.',
      '- For DMs, use the reply tool with the correlationId provided.',
    );

    this._systemPrompt = parts.join('\n');
    return this._systemPrompt;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const allChannels = this.channelMgr.list();
    const channelNames = this.role.channels?.length
      ? this.role.channels.map(normalizeChannelName)
      : allChannels;

    // Subscribe to each channel — push messages into mailbox
    for (const name of channelNames) {
      const channel = this.channelMgr.get(name);
      if (!channel) continue;
      channel.subscribe(this.id, (msg) => {
        this.mailbox.enqueue({ kind: 'channel', msg }, 'channel');
      });
    }

    this.log.info({ role: this.role.title, channels: channelNames.length }, 'Agent started');
    this.drain();
  }

  private async drain(): Promise<void> {
    while (this.running) {
      const item = await this.mailbox.next();
      try {
        if (item.value.kind === 'channel') {
          await this.handleChannelMessage(item.value.msg);
        } else {
          await this.handleDm(item.value.dm);
        }
      } catch (err) {
        this.log.error({ err }, 'Error handling mailbox item');
      }
    }
  }

  stop(): void {
    this.running = false;
    this.log.info('Agent stopped');
  }

  updateRoleAndSkills(role: RoleConfig, skills: SkillConfig[], channels: ChannelConfig[] = []): void {
    this._role = role;
    this.skills = skills;
    this.channels = channels;
    this._systemPrompt = null;
  }

  updateTools(tools: ToolRegistry): void {
    this.tools = tools;
  }

  /** Called by Org to deliver an incoming DM into this agent's mailbox. */
  receiveDm(dm: DmPayload): void {
    this.mailbox.enqueue({ kind: 'dm', dm }, 'dm');
  }

  private async handleChannelMessage(msg: ChannelMessage): Promise<void> {
    this.log.info({ messageId: msg.id, channel: msg.channel, from: msg.from }, 'Handling channel message');

    const rootId = msg.threadId ?? msg.id;
    const channel = this.channelMgr.get(msg.channel);
    if (!channel) return;

    const thread = channel.getThread(rootId);
    const threadText = thread.map(m => `[${m.from}]: ${m.content}`).join('\n');

    const recent = this.teamMemory.recent(10);
    const memoryPrefix = recent.length > 0
      ? `## Recent Team Memory\n${recent.map(m => `[${m.type}][${m.agentId}] ${m.content}`).join('\n')}\n\n`
      : '';

    const input = `${memoryPrefix}[Channel: #${msg.channel}] [Thread ID: ${rootId}]\n${threadText}`;

    this.conversationHistory = [];
    const response = await this.think(input);

    if (response.trim() !== 'NO_ACTION') {
      // Claim thread ownership before posting reply
      channel.claimThread(rootId, this.id);
      this.channelMgr.post(msg.channel, this.id, response, rootId);
      this.log.debug({ messageId: msg.id }, 'Response posted to channel');
    } else {
      this.log.debug({ messageId: msg.id }, 'NO_ACTION — skipping reply');
    }
  }

  private async handleDm(dm: DmPayload): Promise<void> {
    // If this is a reply to our ask(), resolve the pending promise
    if (dm.correlationId && this.pendingReplies.has(dm.correlationId)) {
      this.log.debug({ correlationId: dm.correlationId, from: dm.from }, 'DM reply resolved');
      this.pendingReplies.get(dm.correlationId)!(dm.content);
      this.pendingReplies.delete(dm.correlationId);
      return;
    }

    this.log.info({ from: dm.from, correlationId: dm.correlationId }, 'Handling DM');

    // Set active DM context so the reply tool knows who to reply to
    this._activeDmFrom = dm.from;

    const input = `[Direct Message from ${dm.from}]${dm.correlationId ? ` [correlationId: ${dm.correlationId}]` : ''}\n${dm.content}`;
    this.conversationHistory = [];
    await this.think(input);

    this._activeDmFrom = undefined;
  }

  private async think(input: string): Promise<string> {
    const inputMsg: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(inputMsg);

    if (this.conversationHistory.length > 24) {
      this.conversationHistory = this.conversationHistory.slice(-16);
    }

    const modelId = this._role.model.pinned;
    const provider = this._role.model.provider === 'interview' ? 'anthropic' : this._role.model.provider;

    let finalResponse = '';
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const context: Context = {
        systemPrompt: this.buildSystemPrompt(),
        messages: [...this.conversationHistory],
        tools: this.tools.toolDefinitions(),
      };

      const response: AssistantMessage = await this.llm.chat(context, {
        model: modelId,
        provider,
      });

      const inputTok = response.usage?.input ?? 0;
      const outputTok = response.usage?.output ?? 0;
      totalInputTokens += inputTok;
      totalOutputTokens += outputTok;
      this.log.debug({ iteration: iterations, inputTokens: inputTok, outputTokens: outputTok }, 'LLM call');

      const textBlocks = response.content.filter((b) => b.type === 'text');
      finalResponse = textBlocks.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();

      const toolCalls = response.content.filter((b) => b.type === 'toolCall');
      this.conversationHistory.push(response);

      if (toolCalls.length === 0) {
        break;
      }

      for (const tc of toolCalls) {
        if (tc.type !== 'toolCall') continue;
        let result: string;
        try {
          result = await this.executeSingleTool(tc.name, tc.arguments as Record<string, unknown>);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log.warn({ tool: tc.name, err }, 'Tool call failed');
          result = `ERROR: ${message}`;
        }
        this.conversationHistory.push({
          role: 'toolResult',
          toolCallId: tc.id,
          toolName: tc.name,
          content: [{ type: 'text', text: result }],
          isError: result.startsWith('ERROR:'),
          timestamp: Date.now(),
        });
      }
    }

    this.log.info({ totalInputTokens, totalOutputTokens, iterations }, 'Think turn complete');
    return finalResponse;
  }

  private async executeSingleTool(name: string, args: Record<string, unknown>): Promise<string> {
    this.log.info({ tool: name, params: args }, 'Executing tool');
    return this.tools.execute(name, args);
  }
}

export { type ChannelMessage };
