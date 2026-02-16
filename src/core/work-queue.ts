import { logger } from '../logger';

export interface WorkItem {
  id: string;
  taskId: string;       // reference to task-manager task
  queue: string;        // queue name (e.g. "engineering")
  title: string;
  description: string;
  priority: number;     // lower = higher priority
  status: 'queued' | 'claimed' | 'blocked';
  claimedBy?: string;   // agent id
  blockedReason?: string;
  createdAt: number;
  metadata?: Record<string, any>;
}

export class WorkQueue {
  name: string;
  private items: Map<string, WorkItem>;

  constructor(name: string) {
    this.name = name;
    this.items = new Map();
  }

  push(item: Omit<WorkItem, 'id' | 'status' | 'createdAt' | 'queue'>): WorkItem {
    const workItem: WorkItem = {
      ...item,
      id: crypto.randomUUID(),
      queue: this.name,
      status: 'queued',
      createdAt: Date.now(),
    };
    this.items.set(workItem.id, workItem);
    logger.debug({ queue: this.name, workItemId: workItem.id, taskId: item.taskId }, 'Work item pushed');
    return workItem;
  }

  // Claims the next available item by priority (lower number = higher priority)
  pull(agentId: string): WorkItem | null {
    const available = Array.from(this.items.values())
      .filter(item => item.status === 'queued')
      .sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);

    if (available.length === 0) {
      return null;
    }

    const item = available[0];
    item.status = 'claimed';
    item.claimedBy = agentId;
    logger.debug({ queue: this.name, workItemId: item.id, agentId }, 'Work item claimed');
    return item;
  }

  // Removes the item from the queue (marks as done / deletes)
  complete(itemId: string): void {
    if (!this.items.has(itemId)) {
      throw new Error(`WorkItem "${itemId}" not found in queue "${this.name}"`);
    }
    this.items.delete(itemId);
    logger.debug({ queue: this.name, workItemId: itemId }, 'Work item completed');
  }

  // Puts item back as blocked with a reason
  block(itemId: string, reason: string): void {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`WorkItem "${itemId}" not found in queue "${this.name}"`);
    }
    item.status = 'blocked';
    item.blockedReason = reason;
    item.claimedBy = undefined;
  }

  // Unclaims item, puts back to queued
  release(itemId: string): void {
    const item = this.items.get(itemId);
    if (!item) {
      throw new Error(`WorkItem "${itemId}" not found in queue "${this.name}"`);
    }
    item.status = 'queued';
    item.claimedBy = undefined;
    item.blockedReason = undefined;
  }

  list(status?: WorkItem['status']): WorkItem[] {
    const all = Array.from(this.items.values());
    if (status === undefined) {
      return all;
    }
    return all.filter(item => item.status === status);
  }

  getByAgent(agentId: string): WorkItem[] {
    return Array.from(this.items.values()).filter(
      item => item.claimedBy === agentId
    );
  }
}

export class WorkQueueManager {
  private queues: Map<string, WorkQueue>;

  constructor() {
    this.queues = new Map();
  }

  create(name: string): WorkQueue {
    if (this.queues.has(name)) {
      return this.queues.get(name)!;
    }
    const queue = new WorkQueue(name);
    this.queues.set(name, queue);
    logger.info({ queue: name }, 'Work queue created');
    return queue;
  }

  get(name: string): WorkQueue | undefined {
    return this.queues.get(name);
  }

  list(): string[] {
    return Array.from(this.queues.keys());
  }
}

export const workQueueManager = new WorkQueueManager();
