export interface WorkItem {
  title: string;
  description: string;
  priority: number;
  metadata?: Record<string, unknown>;
}

export class AsyncWorkQueue {
  readonly name: string;
  private items: WorkItem[] = [];
  private waiters: Array<(item: WorkItem) => void> = [];

  constructor(name: string) {
    this.name = name;
  }

  push(item: WorkItem): void {
    if (this.waiters.length > 0) {
      this.waiters.shift()!(item);
      return;
    }
    this.items.push(item);
    this.items.sort((a, b) => a.priority - b.priority);
  }

  pull(): Promise<WorkItem> {
    if (this.items.length > 0) {
      return Promise.resolve(this.items.shift()!);
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  size(): number {
    return this.items.length;
  }
}
