export type MailboxKind = 'dm' | 'channel' | 'work';

export interface MailboxItem<T> {
  value: T;
  kind: MailboxKind;
}

export class Mailbox<T> {
  private queues: Record<MailboxKind, T[]> = { dm: [], channel: [], work: [] };
  private waiters: Array<(item: MailboxItem<T>) => void> = [];

  enqueue(value: T, kind: MailboxKind): void {
    if (this.waiters.length > 0) {
      this.waiters.shift()!({ value, kind });
      return;
    }
    this.queues[kind].push(value);
  }

  async next(): Promise<MailboxItem<T>> {
    for (const kind of ['dm', 'channel', 'work'] as MailboxKind[]) {
      if (this.queues[kind].length > 0) {
        return { value: this.queues[kind].shift()!, kind };
      }
    }
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}
