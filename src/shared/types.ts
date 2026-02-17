/** Shared types used by both backend and UI. */

export interface ChannelMessage {
  id: string;
  channel: string;
  from: string;
  content: string;
  timestamp: number;
  threadId?: string;
  status: 'pending' | 'claimed' | 'done';
  claimedBy?: string;
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
  role: string;
  reportsTo: string;
}

export interface Memory {
  id: string;
  agentId: string;
  type: string;
  content: string;
  tags: string;
  createdAt: number;
  updatedAt: number;
}
