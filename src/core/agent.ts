import {
  systemText, userText, assistantText, assistantWithToolCalls, toolResult as toolResultMsg,
  type Message,
} from '@chinmaymk/aikit';
import { channelManager, type ChannelMessage } from './channel.ts';
import { isRelevant } from './message-relevance.ts';
import { orgManager } from './org.ts';
import { logger } from '../logger';
import type { LLMClient } from './llm-client';
import type { ToolRegistry } from './tool-registry';

export interface RoleConfig {
  id: string;
  title: string;
  level: string;
  reportsTo: string;
  skills: string[];
  model: { provider: string; pinned?: string };
  systemPrompt: string;
  /** Message.from values this role handles (e.g. ["board"]). Only this role receives those messages. */
  handles_sources?: string[];
  /** Channels this role exclusively handles (e.g. ["company"]). Only this role receives in those channels. */
  handles_channels?: string[];
  /** If true, messages from direct reports are relevant. Default: true when level is director | executive. */
  receives_from_direct_reports?: boolean;
  /** Channel ids this role subscribes to (e.g. ["general", "engineering"]). If absent, subscribes to all. */
  channels?: string[];
}

export interface SkillConfig {
  id: string;
  name: string;
  tool: string;
  content: string;
}

export interface ChannelConfig {
  name: string;
  purpose: string;
}

export interface AgentContext {
  role: RoleConfig;
  skills: SkillConfig[];
  agentId: string;
  channels?: ChannelConfig[];
  llm: LLMClient;
  tools: ToolRegistry;
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
  private processing: boolean;
  private messageQueue: ChannelMessage[];
  private log: ReturnType<typeof logger.child>;
  private _systemPrompt: string | null = null;
  private channels: ChannelConfig[];
  private llm: LLMClient;
  private tools: ToolRegistry;

  constructor(context: AgentContext) {
    this.id = context.agentId;
    this._role = context.role;
    this.skills = context.skills;
    this.channels = context.channels ?? [];
    this.conversationHistory = [];
    this.running = false;
    this.processing = false;
    this.messageQueue = [];
    this.log = logger.child({ agentId: this.id });
    this.llm = context.llm;
    this.tools = context.tools;
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
      'Use the available tools to communicate, manage work, and get things done.',
      'Think step by step. After completing tool calls, assess if further action is needed.',
      '',
      '## Message Handling Rules',
      '- Only respond to messages that are directed at you or require action from your role.',
      '- Messages from "board" are directives — always respond to these.',
      `- Messages mentioning your id "${this.id}" or your role "${this.role.id}" are for you.`,
      '- Messages from your direct reports are for you if they are asking for guidance or reporting status.',
      '- Do NOT respond to messages between other agents that do not concern you.',
      '- If a message is not relevant to you, respond with just the text "NO_ACTION" and nothing else.',
    );

    this._systemPrompt = parts.join('\n');
    return this._systemPrompt;
  }

  private isMessageRelevant(msg: ChannelMessage): boolean {
    return isRelevant(
      msg,
      this.id,
      this.role,
      (id) => orgManager.getDirectReports(id),
      (ch) => orgManager.getExclusiveChannelRole(ch)
    );
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    const allChannels = channelManager.list();
    const channelNames =
      this.role.channels?.length
        ? this.role.channels.map((c) => (c.startsWith('#') ? c.slice(1) : c))
        : allChannels;
    for (const channelName of channelNames) {
      try {
        if (!channelManager.get(channelName)) continue;
        channelManager.subscribe(channelName, this.id, (msg: ChannelMessage) => {
          if (!this.isMessageRelevant(msg)) return;
          this.enqueueMessage(msg);
        });
      } catch {
        // Channel may not exist yet
      }
    }

    this.log.info({ role: this.role.title, channels: channelNames.length }, 'Agent started');
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

  private enqueueMessage(msg: ChannelMessage): void {
    this.messageQueue.push(msg);
    this.log.debug(
      { messageId: msg.id, channel: msg.channel, from: msg.from, queueLength: this.messageQueue.length },
      'Message enqueued'
    );
    this.processNextMessage();
  }

  private async processNextMessage(): Promise<void> {
    if (this.processing) return;
    if (this.messageQueue.length === 0) return;

    this.processing = true;
    try {
      while (this.messageQueue.length > 0 && this.running) {
        const msg = this.messageQueue.shift()!;
        try {
          await this.handleMessage(msg);
        } catch (err) {
          this.log.error(
            { err, messageId: msg.id, channel: msg.channel },
            'Error handling message'
          );
        }
      }
    } finally {
      this.processing = false;
    }
  }

  async handleMessage(msg: ChannelMessage): Promise<void> {
    this.log.info({ messageId: msg.id, channel: msg.channel, from: msg.from }, 'Handling message');
    channelManager.claim(msg.id, this.id);

    const input = `[Channel: #${msg.channel}] [From: ${msg.from}]: ${msg.content}`;
    const response = await this.think(input);

    if (response.trim() === 'NO_ACTION') {
      this.log.debug({ messageId: msg.id }, 'Message skipped (NO_ACTION) — releasing');
      channelManager.release(msg.id);
      return;
    }

    channelManager.complete(msg.id);
  }

  async send(channel: string, content: string, threadId?: string): Promise<void> {
    channelManager.post(channel, this.id, content, threadId);
  }

  private async think(input: string): Promise<string> {
    const inputMsg = userText(input);
    this.conversationHistory.push(inputMsg);

    // Keep conversation history bounded to avoid huge prompts and rate limits
    if (this.conversationHistory.length > 24) {
      this.conversationHistory = this.conversationHistory.slice(-16);
    }

    const sysMsg = systemText(this.buildSystemPrompt());
    const loopMessages: Message[] = [sysMsg, ...this.conversationHistory];

    const modelId = this._role.model.pinned;
    const provider = this._role.model.provider === 'interview' ? 'anthropic' : this._role.model.provider;

    let finalResponse = '';
    let iterations = 0;
    const MAX_ITERATIONS = 10;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const response = await this.llm.chat(loopMessages, {
        tools: this.tools.toolDefinitions(),
        model: modelId,
        provider,
      });

      const inputTok = response.usage?.inputTokens ?? 0;
      const outputTok = response.usage?.outputTokens ?? 0;
      totalInputTokens += inputTok;
      totalOutputTokens += outputTok;
      this.log.debug({ iteration: iterations, inputTokens: inputTok, outputTokens: outputTok }, 'LLM call');

      finalResponse = response.content;

      if (!response.toolCalls || response.toolCalls.length === 0) {
        // No tool calls — final text response
        if (response.content) {
          loopMessages.push(assistantText(response.content));
        }
        break;
      }

      // Assistant message with tool calls (proper format for the API)
      loopMessages.push(assistantWithToolCalls(response.content, response.toolCalls));

      // Execute each tool call and build proper tool result messages
      for (const tc of response.toolCalls) {
        let result: string;
        try {
          result = await this.executeSingleTool(tc.name, tc.arguments as Record<string, any>);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.log.warn({ tool: tc.name, err }, 'Tool call failed');
          result = `ERROR: ${message}`;
        }
        loopMessages.push(toolResultMsg(tc.id, result));
      }
    }

    this.log.info({ totalInputTokens, totalOutputTokens, iterations }, 'Think turn complete');

    if (finalResponse) {
      this.conversationHistory.push(assistantText(finalResponse));
    }

    return finalResponse;
  }

  private async executeSingleTool(name: string, args: Record<string, any>): Promise<string> {
    this.log.info({ tool: name }, 'Executing tool');
    return this.tools.execute(name, args);
  }
}

export { type ChannelMessage };
