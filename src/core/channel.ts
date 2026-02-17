import { logger } from '../logger';

export interface ChannelMessage {
  id: string;
  channel: string;
  from: string;
  content: string;
  timestamp: number;
  threadId?: string;  // root message id this replies to
  status: 'pending' | 'claimed' | 'done';
  claimedBy?: string;
}

export class Channel {
  name: string;
  messages: ChannelMessage[];

  constructor(name: string) {
    this.name = name;
    this.messages = [];
  }

  post(from: string, content: string, threadId?: string): ChannelMessage {
    const msg: ChannelMessage = {
      id: crypto.randomUUID(),
      channel: this.name,
      from,
      content,
      timestamp: Date.now(),
      status: 'pending',
    };
    if (threadId) msg.threadId = threadId;
    this.messages.push(msg);
    return msg;
  }

  /** Root message + all replies, ordered by timestamp. */
  getThread(rootId: string): ChannelMessage[] {
    return this.messages
      .filter(m => m.id === rootId || m.threadId === rootId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  /** First pending message not posted by this agent. */
  nextPending(excludeAgentId: string): ChannelMessage | null {
    return this.messages.find(
      m => m.status === 'pending' && m.from !== excludeAgentId
    ) ?? null;
  }

  claim(messageId: string, agentId: string): void {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.status = 'claimed';
      msg.claimedBy = agentId;
    }
  }

  done(messageId: string): void {
    const msg = this.messages.find(m => m.id === messageId);
    if (msg) {
      msg.status = 'done';
      msg.claimedBy = undefined;
    }
  }

  history(limit?: number): ChannelMessage[] {
    if (limit === undefined) return [...this.messages];
    return this.messages.slice(-limit);
  }
}

export class ChannelManager {
  private channels: Map<string, Channel> = new Map();

  create(name: string): Channel {
    const key = normalizeChannelName(name);
    if (this.channels.has(key)) return this.channels.get(key)!;
    const channel = new Channel(key);
    this.channels.set(key, channel);
    logger.info({ channel: name }, 'Channel created');
    return channel;
  }

  get(name: string): Channel | undefined {
    return this.channels.get(normalizeChannelName(name));
  }

  post(channelName: string, from: string, content: string, threadId?: string): ChannelMessage {
    const key = normalizeChannelName(channelName);
    const channel = this.channels.get(key);
    if (!channel) throw new Error(`Channel "${channelName}" does not exist`);
    return channel.post(from, content, threadId);
  }

  list(): string[] {
    return Array.from(this.channels.keys());
  }
}

/** Strip leading # so "#engineering" and "engineering" both resolve to "engineering". */
export function normalizeChannelName(name: string): string {
  return name.startsWith('#') ? name.slice(1) : name;
}
