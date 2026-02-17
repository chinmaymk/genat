import { logger } from '../logger';

export interface ChannelMessage {
  id: string;
  channel: string;
  from: string;       // agent id
  content: string;
  timestamp: number;
  threadId?: string;  // for threaded replies
  status: 'pending' | 'active' | 'done';
  claimedBy?: string;
}

/** When set, only these subscriber ids are notified (used for single-recipient routing). */
export type MessageRouter = (msg: ChannelMessage, subscriberIds: string[]) => string[];

export class Channel {
  name: string;
  messages: ChannelMessage[];
  subscribers: Set<string>; // agent ids

  constructor(name: string) {
    this.name = name;
    this.messages = [];
    this.subscribers = new Set();
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

  subscribe(agentId: string): void {
    this.subscribers.add(agentId);
  }

  unsubscribe(agentId: string): void {
    this.subscribers.delete(agentId);
  }

  history(limit?: number): ChannelMessage[] {
    if (limit === undefined) {
      return [...this.messages];
    }
    return this.messages.slice(-limit);
  }

  getThread(threadId: string): ChannelMessage[] {
    return this.messages.filter(
      m => m.id === threadId || m.threadId === threadId
    );
  }
}

export class ChannelManager {
  private channels: Map<string, Channel>;
  /** agentId -> (channelName -> callback). Only the callback for the posted channel is invoked. */
  private listeners: Map<string, Map<string, (msg: ChannelMessage) => void>>;
  private router: MessageRouter | null = null;
  /** threadId (root message id) -> agentId: tracks which agent owns a thread. */
  private threadOwner: Map<string, string> = new Map();

  constructor() {
    this.channels = new Map();
    this.listeners = new Map();
  }

  setRouter(router: MessageRouter): void {
    this.router = router;
  }

  create(name: string): Channel {
    const key = normalizeChannelName(name);
    if (this.channels.has(key)) {
      return this.channels.get(key)!;
    }
    const channel = new Channel(key);
    this.channels.set(key, channel);
    logger.info({ channel: name }, 'Channel created');
    return channel;
  }

  get(name: string): Channel | undefined {
    return this.channels.get(normalizeChannelName(name));
  }

  private deliver(msg: ChannelMessage, key: string, channel: Channel): void {
    const subscriberIds = Array.from(channel.subscribers);

    let toNotify: string[];

    // If this is a thread reply and there is a registered thread owner, route only to them.
    if (msg.threadId && this.threadOwner.has(msg.threadId)) {
      const owner = this.threadOwner.get(msg.threadId)!;
      toNotify = subscriberIds.includes(owner) ? [owner] : [];
    } else {
      toNotify = this.router != null ? this.router(msg, subscriberIds) : subscriberIds;
    }

    for (const subscriberId of toNotify) {
      const channelCallbacks = this.listeners.get(subscriberId);
      const cb = channelCallbacks?.get(key);
      if (cb) {
        try {
          cb(msg);
        } catch (err) {
          logger.error(
            { err, channelName: key, subscriberId, messageId: msg.id },
            'Channel listener error'
          );
        }
      }
    }
  }

  post(
    channelName: string,
    from: string,
    content: string,
    threadId?: string
  ): ChannelMessage {
    const key = normalizeChannelName(channelName);
    const channel = this.channels.get(key);
    if (!channel) {
      throw new Error(`Channel "${channelName}" does not exist`);
    }

    const msg = channel.post(from, content, threadId);
    this.deliver(msg, key, channel);
    return msg;
  }

  subscribe(
    channelName: string,
    agentId: string,
    callback: (msg: ChannelMessage) => void
  ): void {
    const key = normalizeChannelName(channelName);
    const channel = this.channels.get(key);
    if (!channel) {
      throw new Error(`Channel "${channelName}" does not exist`);
    }

    channel.subscribe(agentId);

    if (!this.listeners.has(agentId)) {
      this.listeners.set(agentId, new Map());
    }
    this.listeners.get(agentId)!.set(key, callback);
  }

  claim(messageId: string, agentId: string): void {
    const msg = this.findMessage(messageId);
    if (!msg) return;
    msg.status = 'active';
    msg.claimedBy = agentId;
    // Root messages (no threadId) register this agent as thread owner
    if (!msg.threadId) {
      this.threadOwner.set(msg.id, agentId);
    }
  }

  complete(messageId: string): void {
    const msg = this.findMessage(messageId);
    if (!msg) return;
    msg.status = 'done';
    msg.claimedBy = undefined;
  }

  release(messageId: string): void {
    const msg = this.findMessage(messageId);
    if (!msg) return;
    // Remove thread ownership if releasing a root message
    if (!msg.threadId && msg.claimedBy) {
      this.threadOwner.delete(msg.id);
    }
    msg.status = 'pending';
    msg.claimedBy = undefined;
    const channel = this.channels.get(msg.channel);
    if (channel) this.deliver(msg, msg.channel, channel);
  }

  private findMessage(messageId: string): ChannelMessage | undefined {
    for (const channel of this.channels.values()) {
      const msg = channel.messages.find(m => m.id === messageId);
      if (msg) return msg;
    }
    return undefined;
  }

  getChannelsForAgent(agentId: string): Channel[] {
    const result: Channel[] = [];
    for (const channel of this.channels.values()) {
      if (channel.subscribers.has(agentId)) {
        result.push(channel);
      }
    }
    return result;
  }

  list(): string[] {
    return Array.from(this.channels.keys());
  }
}

/** Normalize channel name for lookup: strip leading # so "#engineering" and "engineering" both work. */
function normalizeChannelName(name: string): string {
  return name.startsWith('#') ? name.slice(1) : name;
}

