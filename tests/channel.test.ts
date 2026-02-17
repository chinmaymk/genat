import { describe, test, expect, beforeEach } from 'bun:test';
import { Channel, ChannelManager } from '../src/core/channel';

describe('Channel.post', () => {
  test('creates a pending message with correct fields', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-1', 'hello world');
    expect(msg.channel).toBe('test');
    expect(msg.from).toBe('agent-1');
    expect(msg.content).toBe('hello world');
    expect(msg.status).toBe('pending');
    expect(msg.claimedBy).toBeUndefined();
    expect(ch.messages).toHaveLength(1);
  });

  test('sets threadId when provided', () => {
    const ch = new Channel('test');
    const root = ch.post('a', 'root');
    const reply = ch.post('b', 'reply', root.id);
    expect(reply.threadId).toBe(root.id);
  });
});

describe('Channel.getThread', () => {
  test('returns root + all replies ordered by timestamp', () => {
    const ch = new Channel('test');
    const root = ch.post('a', 'root');
    ch.post('b', 'reply-1', root.id);
    ch.post('c', 'reply-2', root.id);
    const thread = ch.getThread(root.id);
    expect(thread).toHaveLength(3);
    expect(thread[0].content).toBe('root');
  });

  test('does not include messages from other threads', () => {
    const ch = new Channel('test');
    const r1 = ch.post('a', 'thread-1');
    const r2 = ch.post('b', 'thread-2');
    ch.post('c', 'reply to thread-1', r1.id);
    expect(ch.getThread(r2.id)).toHaveLength(1);
  });
});

describe('Channel.nextPending', () => {
  test('returns first pending message not from this agent', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-2', 'work item');
    expect(ch.nextPending('agent-1')).toEqual(msg);
  });

  test('excludes messages posted by the polling agent', () => {
    const ch = new Channel('test');
    ch.post('agent-1', 'my own message');
    expect(ch.nextPending('agent-1')).toBeNull();
  });

  test('excludes claimed messages', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-2', 'work item');
    ch.claim(msg.id, 'agent-1');
    expect(ch.nextPending('agent-3')).toBeNull();
  });

  test('excludes done messages', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-2', 'work item');
    ch.claim(msg.id, 'agent-1');
    ch.done(msg.id);
    expect(ch.nextPending('agent-3')).toBeNull();
  });

  test('returns null when channel is empty', () => {
    const ch = new Channel('test');
    expect(ch.nextPending('agent-1')).toBeNull();
  });
});

describe('Channel.claim / done', () => {
  test('claim sets status to claimed and sets claimedBy', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-2', 'work');
    ch.claim(msg.id, 'agent-1');
    expect(msg.status).toBe('claimed');
    expect(msg.claimedBy).toBe('agent-1');
  });

  test('done sets status to done and clears claimedBy', () => {
    const ch = new Channel('test');
    const msg = ch.post('agent-2', 'work');
    ch.claim(msg.id, 'agent-1');
    ch.done(msg.id);
    expect(msg.status).toBe('done');
    expect(msg.claimedBy).toBeUndefined();
  });
});

describe('Channel.history', () => {
  test('returns all messages when no limit', () => {
    const ch = new Channel('test');
    for (let i = 0; i < 5; i++) ch.post('a', `msg ${i}`);
    expect(ch.history()).toHaveLength(5);
  });

  test('respects limit', () => {
    const ch = new Channel('test');
    for (let i = 0; i < 10; i++) ch.post('a', `msg ${i}`);
    expect(ch.history(3)).toHaveLength(3);
  });
});

describe('ChannelManager', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
  });

  test('create and list channels', () => {
    manager.create('general');
    manager.create('random');
    expect(manager.list()).toEqual(['general', 'random']);
  });

  test('create is idempotent', () => {
    manager.create('general');
    manager.create('general');
    expect(manager.list()).toHaveLength(1);
  });

  test('post stores message in channel', () => {
    manager.create('general');
    const msg = manager.post('general', 'agent-1', 'hello');
    expect(manager.get('general')!.messages).toHaveLength(1);
    expect(msg.content).toBe('hello');
  });

  test('normalizes #channel name on create, get, and post', () => {
    manager.create('#engineering');
    expect(manager.get('engineering')).toBeDefined();
    expect(manager.get('#engineering')).toBe(manager.get('engineering'));
    const msg = manager.post('#engineering', 'a', 'hi');
    expect(msg.channel).toBe('engineering');
  });

  test('post throws when channel does not exist', () => {
    expect(() => manager.post('missing', 'a', 'hi')).toThrow();
  });
});
