import { logger } from '../logger';
import type { ChannelMessage } from '../shared/types';

export type { ChannelMessage };

export class Channel {
  name: string;
  private messages: ChannelMessage[] = [];
  private subscribers: Map<string, (msg: ChannelMessage) => void> = new Map();
  private threadOwners: Map<string, string> = new Map(); // threadId -> agentId
  private members: string[] | null = null; // null = open channel

  constructor(name: string, members?: string[]) {
    this.name = name;
    if (members) this.members = [...members];
  }

  subscribe(agentId: string, handler: (msg: ChannelMessage) => void): void {
    this.subscribers.set(agentId, handler);
  }

  unsubscribe(agentId: string): void {
    this.subscribers.delete(agentId);
  }

  post(from: string, content: string, threadId?: string): ChannelMessage {
    const msg: ChannelMessage = {
      id: crypto.randomUUID(),
      channel: this.name,
      from,
      content,
      timestamp: Date.now(),
      status: 'done',
    };
    if (threadId) msg.threadId = threadId;
    this.messages.push(msg);

    // Thread reply: only deliver to thread owner
    if (threadId) {
      const owner = this.threadOwners.get(threadId);
      if (owner && owner !== from) {
        this.subscribers.get(owner)?.(msg);
      }
      return msg;
    }

    // Root message: fan-out to all subscribers except sender
    for (const [agentId, handler] of this.subscribers) {
      if (agentId !== from) handler(msg);
    }
    return msg;
  }

  claimThread(threadId: string, agentId: string): void {
    if (!this.threadOwners.has(threadId)) {
      this.threadOwners.set(threadId, agentId);
    }
  }

  getThreadOwner(threadId: string): string | undefined {
    return this.threadOwners.get(threadId);
  }

  getThread(rootId: string): ChannelMessage[] {
    return this.messages
      .filter(m => m.id === rootId || m.threadId === rootId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  history(limit?: number): ChannelMessage[] {
    if (limit === undefined) return [...this.messages];
    return this.messages.slice(-limit);
  }

  getMembers(): string[] {
    return this.members ? [...this.members] : [];
  }

  addMember(agentId: string): void {
    if (this.members && !this.members.includes(agentId)) {
      this.members.push(agentId);
    }
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

  createDynamic(name: string, members: string[]): Channel {
    const key = normalizeChannelName(name);
    if (this.channels.has(key)) return this.channels.get(key)!;
    const channel = new Channel(key, members);
    this.channels.set(key, channel);
    logger.info({ channel: name, members }, 'Dynamic channel created');
    return channel;
  }

  invite(name: string, agentId: string): void {
    const channel = this.get(name);
    if (!channel) throw new Error(`Channel "${name}" does not exist`);
    channel.addMember(agentId);
  }

  get(name: string): Channel | undefined {
    return this.channels.get(normalizeChannelName(name));
  }

  subscribe(channelName: string, agentId: string, handler: (msg: ChannelMessage) => void): void {
    const channel = this.get(channelName);
    if (!channel) throw new Error(`Channel "${channelName}" does not exist`);
    channel.subscribe(agentId, handler);
  }

  post(channelName: string, from: string, content: string, threadId?: string): ChannelMessage {
    const key = normalizeChannelName(channelName);
    const channel = this.channels.get(key);
    if (!channel) throw new Error(`Channel "${channelName}" does not exist`);
    return channel.post(from, content, threadId);
  }

  getMembers(name: string): string[] {
    return this.get(normalizeChannelName(name))?.getMembers() ?? [];
  }

  list(): string[] {
    return Array.from(this.channels.keys());
  }
}

/** Strip leading # so "#engineering" and "engineering" both resolve to "engineering". */
export function normalizeChannelName(name: string): string {
  if (name == null || typeof name !== 'string') {
    throw new Error('Channel name is required and must be a string');
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error('Channel name cannot be empty');
  return trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
}
