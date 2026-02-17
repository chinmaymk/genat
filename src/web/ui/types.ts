export interface ChannelMessage {
  id: string;
  channel: string;
  from: string;
  content: string;
  timestamp: number;
  threadId?: string;
}

export interface ChannelSummary {
  name: string;
  subscribers: string[];
  messageCount: number;
  latestMessage: ChannelMessage | null;
}

export interface ChannelDetail {
  name: string;
  subscribers: string[];
  messages: ChannelMessage[];
  triagedBy?: Record<string, string>;
}

export interface OrgMember {
  id: string;
  [key: string]: unknown;
}

export type View = 'dashboard' | 'channels' | 'org';
