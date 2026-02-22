import type { Context, Message, AssistantMessage } from '@mariozechner/pi-ai';
import { Channel, ChannelManager, normalizeChannelName, type ChannelMessage } from './channel.ts';
import { logger } from '../logger';
import type { ILLMClient } from './llm-client';
import type { ToolRegistry } from './tool-registry';
import type { ChannelConfig } from './org-loader';
import type { TeamMemory } from './team-memory';

export interface RoleConfig {
  id: string;
  title: string;
  level: string;
  reportsTo: string;
  skills: string[];
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
      '- You receive messages from channels you monitor.',
      '- You see the full thread context — respond to the most recent message.',
      '- Write your reply as plain text. The framework automatically posts it to the current thread — you never need to call post_message for in-thread replies.',
      '- If this message requires no response from you, reply with exactly "NO_ACTION".',
      '- Use the post_message tool only to contact agents in other channels (to ask for help, delegate work, etc.).',
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

    this.log.info({ role: this.role.title, channels: channelNames.length }, 'Agent started');
    this.poll(channelNames);
  }

  private async poll(channelNames: string[]): Promise<void> {
    while (this.running) {
      let foundWork = false;
      for (const name of channelNames) {
        const channel = this.channelMgr.get(name);
        if (!channel) continue;
        const msg = channel.nextPending(this.id);
        if (msg) {
          channel.claim(msg.id, this.id);
          try {
            await this.handleMessage(msg, channel);
          } catch (err) {
            this.log.error({ err, messageId: msg.id }, 'Error handling message');
            channel.done(msg.id);
          }
          foundWork = true;
          break;
        }
      }
      if (!foundWork) {
        await Bun.sleep(1000);
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

  async handleMessage(msg: ChannelMessage, channel: Channel): Promise<void> {
    this.log.info({ messageId: msg.id, channel: msg.channel, from: msg.from }, 'Handling message');

    const rootId = msg.threadId ?? msg.id;
    const thread = channel.getThread(rootId);
    const threadText = thread.map(m => `[${m.from}]: ${m.content}`).join('\n');

    const recent = this.teamMemory.recent(10);
    const memoryPrefix = recent.length > 0
      ? `## Recent Team Memory\n${recent.map(m => `[${m.type}][${m.agentId}] ${m.content}`).join('\n')}\n\n`
      : '';

    const input = `${memoryPrefix}[Channel: #${msg.channel}] [Thread ID: ${rootId}]\n${threadText}`;

    // Each message is handled with a fresh conversation; thread context is already in input
    this.conversationHistory = [];
    const response = await this.think(input);

    if (response.trim() !== 'NO_ACTION') {
      await this.send(msg.channel, response, rootId);
      this.log.debug({ messageId: msg.id }, 'Response posted');
    } else {
      this.log.debug({ messageId: msg.id }, 'NO_ACTION — skipping reply');
    }

    channel.done(msg.id);
  }

  async send(channel: string, content: string, threadId?: string): Promise<void> {
    this.channelMgr.post(channel, this.id, content, threadId);
  }

  private async think(input: string): Promise<string> {
    const inputMsg: Message = {
      role: 'user',
      content: input,
      timestamp: Date.now(),
    };
    this.conversationHistory.push(inputMsg);

    // Keep conversation history bounded to avoid huge prompts and rate limits
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
