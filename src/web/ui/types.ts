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

export interface WorkItem {
  id: string;
  taskId: string;
  queue: string;
  title: string;
  description: string;
  priority: number;
  status: 'queued' | 'claimed' | 'blocked';
  claimedBy?: string;
  blockedReason?: string;
  createdAt: number;
}

export interface QueueSummary {
  name: string;
  total: number;
  queued: number;
  claimed: number;
  blocked: number;
}

export interface QueueDetail {
  name: string;
  items: WorkItem[];
}

export interface OrgMember {
  id: string;
  [key: string]: unknown;
}

export interface Task {
  id: string;
  type: string;
  title: string;
  description?: string;
  status: string;
  parentId?: string;
  [key: string]: unknown;
}

export type View = 'dashboard' | 'channels' | 'tasks' | 'queues' | 'org';
