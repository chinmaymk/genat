import { describe, test, expect, beforeEach } from 'bun:test';
import { Channel, ChannelManager } from '../src/core/channel';

describe('Channel.post — fan-out', () => {
  test('delivers message to all subscribers', () => {
    const ch = new Channel('test');
    const received: string[] = [];
    ch.subscribe('agent-1', (msg) => received.push(`a1:${msg.content}`));
    ch.subscribe('agent-2', (msg) => received.push(`a2:${msg.content}`));
    ch.post('agent-3', 'hello');
    expect(received).toContain('a1:hello');
    expect(received).toContain('a2:hello');
  });

  test('does not deliver to the sender', () => {
    const ch = new Channel('test');
    const received: string[] = [];
    ch.subscribe('agent-1', (msg) => received.push(msg.content));
    ch.post('agent-1', 'my own message');
    expect(received).toHaveLength(0);
  });
});

describe('Channel — thread ownership', () => {
  test('first reply claims thread ownership', () => {
    const ch = new Channel('test');
    const root = ch.post('agent-1', 'question');
    ch.claimThread(root.id, 'agent-2');
    expect(ch.getThreadOwner(root.id)).toBe('agent-2');
  });

  test('thread reply only delivered to thread owner', () => {
    const ch = new Channel('test');
    const received1: string[] = [];
    const received2: string[] = [];
    ch.subscribe('agent-2', (msg) => received1.push(msg.content));
    ch.subscribe('agent-3', (msg) => received2.push(msg.content));
    const root = ch.post('agent-1', 'question');
    ch.claimThread(root.id, 'agent-2');
    ch.post('agent-1', 'follow-up', root.id);
    expect(received1).toContain('follow-up');
    expect(received2).not.toContain('follow-up');
  });
});

describe('Channel.history', () => {
  test('returns all messages', () => {
    const ch = new Channel('test');
    ch.post('a', 'one');
    ch.post('b', 'two');
    expect(ch.history()).toHaveLength(2);
  });

  test('respects limit', () => {
    const ch = new Channel('test');
    for (let i = 0; i < 10; i++) ch.post('a', `msg ${i}`);
    expect(ch.history(3)).toHaveLength(3);
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
});

describe('ChannelManager', () => {
  let manager: ChannelManager;
  beforeEach(() => { manager = new ChannelManager(); });

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

  test('normalizes #channel name', () => {
    manager.create('#engineering');
    expect(manager.get('engineering')).toBeDefined();
    expect(manager.get('#engineering')).toBe(manager.get('engineering'));
  });

  test('subscribe and receive a message', () => {
    manager.create('general');
    const received: string[] = [];
    manager.subscribe('general', 'agent-1', (msg) => received.push(msg.content));
    manager.post('general', 'agent-2', 'hello');
    expect(received).toEqual(['hello']);
  });

  test('post throws when channel does not exist', () => {
    expect(() => manager.post('missing', 'a', 'hi')).toThrow();
  });

  test('dynamically create channel with members', () => {
    manager.createDynamic('project-x', ['agent-1', 'agent-2']);
    expect(manager.get('project-x')).toBeDefined();
    expect(manager.getMembers('project-x')).toEqual(['agent-1', 'agent-2']);
  });

  test('invite adds member to existing channel', () => {
    manager.createDynamic('project-x', ['agent-1']);
    manager.invite('project-x', 'agent-2');
    expect(manager.getMembers('project-x')).toContain('agent-2');
  });
});
