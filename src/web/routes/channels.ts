import { Hono } from 'hono';
import { channelManager } from '../../core/channel';

export function createChannelsRoutes() {
  const api = new Hono();

  // GET / — list all channels with summary info
  api.get('/', (c) => {
    const names = channelManager.list();
    const channels = names.map((name) => {
      const ch = channelManager.get(name)!;
      return {
        name,
        subscribers: Array.from(ch.subscribers),
        messageCount: ch.messages.length,
        latestMessage: ch.messages.at(-1) ?? null,
      };
    });
    return c.json({ channels });
  });

  // GET /:name — fetch channel messages (optional ?limit=N)
  api.get('/:name', (c) => {
    const name = c.req.param('name');
    const channel = channelManager.get(name);
    if (!channel) {
      return c.json({ error: `Channel "${name}" not found` }, 404);
    }

    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const messages = channel.history(limit);
    const triagedBy: Record<string, string> = {};
    for (const msg of messages) {
      const agent = msg.claimedBy;
      if (agent) triagedBy[msg.id] = agent;
    }

    return c.json({
      name: channel.name,
      subscribers: Array.from(channel.subscribers),
      messages,
      triagedBy,
    });
  });

  // POST /:name/messages — post a message to a channel
  api.post('/:name/messages', async (c) => {
    const name = c.req.param('name');
    const channel = channelManager.get(name);
    if (!channel) {
      return c.json({ error: `Channel "${name}" not found` }, 404);
    }

    let body: { content?: string; from?: string; threadId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const content = body?.content?.trim();
    if (!content) {
      return c.json({ error: 'content is required' }, 400);
    }

    const from = body?.from?.trim() || 'board';
    const threadId = body?.threadId?.trim();

    try {
      const msg = channelManager.post(name, from, content, threadId);
      return c.json({ message: msg }, 201);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return api;
}
