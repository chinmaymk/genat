import { describe, test, expect, beforeEach } from 'bun:test';
import { Channel, ChannelManager } from '../src/core/channel';

describe('Channel', () => {
  let channel: Channel;

  beforeEach(() => {
    channel = new Channel('test');
  });

  test('post and retrieve messages', () => {
    const msg = channel.post('agent-1', 'hello world');
    expect(msg.channel).toBe('test');
    expect(msg.from).toBe('agent-1');
    expect(msg.content).toBe('hello world');
    expect(channel.history()).toHaveLength(1);
  });

  test('subscribe and unsubscribe', () => {
    channel.subscribe('agent-1');
    expect(channel.subscribers.has('agent-1')).toBe(true);
    channel.unsubscribe('agent-1');
    expect(channel.subscribers.has('agent-1')).toBe(false);
  });

  test('threaded messages', () => {
    const parent = channel.post('a', 'parent');
    channel.post('b', 'reply', parent.id);
    const thread = channel.getThread(parent.id);
    expect(thread).toHaveLength(2);
    expect(thread[0].content).toBe('parent');
    expect(thread[1].content).toBe('reply');
  });

  test('history limit', () => {
    for (let i = 0; i < 10; i++) channel.post('a', `msg ${i}`);
    expect(channel.history(3)).toHaveLength(3);
  });

  test('post sets status to pending', () => {
    const msg = channel.post('agent-1', 'hello');
    expect(msg.status).toBe('pending');
    expect(msg.claimedBy).toBeUndefined();
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

  test('post delivers to subscribers', () => {
    manager.create('general');
    const received: string[] = [];
    manager.subscribe('general', 'agent-1', (msg) => received.push(msg.content));
    manager.post('general', 'agent-2', 'hello');
    expect(received).toEqual(['hello']);
  });

  test('getChannelsForAgent', () => {
    manager.create('a');
    manager.create('b');
    manager.subscribe('a', 'x', () => {});
    manager.subscribe('b', 'x', () => {});
    expect(manager.getChannelsForAgent('x')).toHaveLength(2);
  });

  test('normalizes #channel to channel for post and subscribe', () => {
    manager.create('engineering');
    const received: string[] = [];
    manager.subscribe('#engineering', 'agent-1', (msg) => received.push(msg.content));
    manager.post('#engineering', 'swe-1', 'hello from #engineering');
    expect(received).toEqual(['hello from #engineering']);
    expect(manager.get('engineering')).toBeDefined();
    expect(manager.get('#engineering')).toBe(manager.get('engineering'));
  });
});

describe('ChannelManager lifecycle', () => {
  let manager: ChannelManager;

  beforeEach(() => {
    manager = new ChannelManager();
    manager.create('general');
  });

  test('claim transitions pending to active and sets claimedBy', () => {
    const msg = manager.post('general', 'agent-2', 'hello');
    expect(msg.status).toBe('pending');
    manager.claim(msg.id, 'agent-1');
    expect(msg.status).toBe('active');
    expect(msg.claimedBy).toBe('agent-1');
  });

  test('complete transitions active to done and clears claimedBy', () => {
    const msg = manager.post('general', 'agent-2', 'hello');
    manager.claim(msg.id, 'agent-1');
    manager.complete(msg.id);
    expect(msg.status).toBe('done');
    expect(msg.claimedBy).toBeUndefined();
  });

  test('release resets to pending and clears claimedBy', () => {
    const msg = manager.post('general', 'agent-2', 'hello');
    manager.claim(msg.id, 'agent-1');
    manager.release(msg.id);
    expect(msg.status).toBe('pending');
    expect(msg.claimedBy).toBeUndefined();
  });

  test('release re-delivers to router', () => {
    const delivered: string[] = [];
    manager.subscribe('general', 'agent-1', (m) => delivered.push(`agent-1:${m.content}`));
    manager.subscribe('general', 'agent-2', (m) => delivered.push(`agent-2:${m.content}`));
    manager.setRouter((_, ids) => [ids[0]]);

    const msg = manager.post('general', 'agent-3', 'task');
    expect(delivered).toEqual(['agent-1:task']);

    delivered.length = 0;
    manager.release(msg.id);
    expect(delivered).toEqual(['agent-1:task']);
  });

  test('claim on root message registers thread owner', () => {
    const received: string[] = [];
    manager.subscribe('general', 'agent-1', (m) => received.push('agent-1'));
    manager.subscribe('general', 'agent-2', (m) => received.push('agent-2'));
    // Router would normally pick agent-2
    manager.setRouter((_, ids) => {
      const a2 = ids.find(id => id === 'agent-2');
      return a2 ? [a2] : [];
    });

    const root = manager.post('general', 'user', 'root message');
    received.length = 0;

    // agent-1 claims the root → becomes thread owner
    manager.claim(root.id, 'agent-1');

    // Reply in same thread → should route to agent-1 despite router preferring agent-2
    manager.post('general', 'user', 'reply', root.id);
    expect(received).toEqual(['agent-1']);
  });

  test('thread reply with no owner falls back to normal routing', () => {
    const received: string[] = [];
    manager.subscribe('general', 'agent-1', (m) => received.push('agent-1'));
    manager.subscribe('general', 'agent-2', (m) => received.push('agent-2'));
    manager.setRouter((_, ids) => {
      const a2 = ids.find(id => id === 'agent-2');
      return a2 ? [a2] : [];
    });

    // Reply to unknown thread — no owner registered
    manager.post('general', 'user', 'reply', 'unknown-thread-id');
    expect(received).toEqual(['agent-2']);
  });
});
