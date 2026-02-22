import { AsyncWorkQueue } from './async-work-queue';

export class WorkQueueManager {
  private queues: Map<string, AsyncWorkQueue> = new Map();

  getOrCreate(name: string): AsyncWorkQueue {
    if (!this.queues.has(name)) {
      this.queues.set(name, new AsyncWorkQueue(name));
    }
    return this.queues.get(name)!;
  }

  get(name: string): AsyncWorkQueue | undefined {
    return this.queues.get(name);
  }

  list(): string[] {
    return Array.from(this.queues.keys());
  }
}
