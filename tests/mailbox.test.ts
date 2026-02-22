import { describe, test, expect } from 'bun:test';
import { Mailbox } from '../src/core/mailbox';

describe('Mailbox', () => {
  test('enqueue and dequeue a single item', async () => {
    const box = new Mailbox<string>();
    box.enqueue('hello', 'channel');
    const item = await box.next();
    expect(item.value).toBe('hello');
    expect(item.kind).toBe('channel');
  });

  test('next() resolves when item arrives after await', async () => {
    const box = new Mailbox<string>();
    const p = box.next();
    box.enqueue('late', 'dm');
    const item = await p;
    expect(item.value).toBe('late');
  });

  test('dm items drain before channel items', async () => {
    const box = new Mailbox<string>();
    box.enqueue('channel-msg', 'channel');
    box.enqueue('dm-msg', 'dm');
    const first = await box.next();
    expect(first.kind).toBe('dm');
  });

  test('channel items drain before work items', async () => {
    const box = new Mailbox<string>();
    box.enqueue('work-item', 'work');
    box.enqueue('channel-msg', 'channel');
    const first = await box.next();
    expect(first.kind).toBe('channel');
  });
});
