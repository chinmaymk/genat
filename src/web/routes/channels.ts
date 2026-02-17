import { Hono } from 'hono';
import { ChannelManager } from '../../core/channel';

export function createChannelsRoutes(channels: ChannelManager) {
  const api = new Hono();

  // GET / — list all channels with summary info
  api.get('/', (c) => {
    const names = channels.list();
    const channelList = names.map((name) => {
      const ch = channels.get(name)!;
      return {
        name,
        messageCount: ch.messages.length,
        latestMessage: ch.messages.at(-1) ?? null,
        subscribers: [] as string[], // Channel model does not track subscribers yet
      };
    });
    return c.json({ channels: channelList });
  });

  // GET /:name — fetch channel messages (optional ?limit=N)
  api.get('/:name', (c) => {
    const name = c.req.param('name');
    const channel = channels.get(name);
    if (!channel) {
      return c.json({ error: `Channel "${name}" not found` }, 404);
    }

    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : undefined;
    const messages = channel.history(limit);

    const triagedBy: Record<string, string> = {};
    for (const m of messages) {
      if (m.claimedBy) triagedBy[m.id] = m.claimedBy;
    }

    return c.json({
      name: channel.name,
      messages,
      subscribers: [] as string[],
      triagedBy,
    });
  });

  // POST /:name/messages — post a message to a channel
  api.post('/:name/messages', async (c) => {
    const name = c.req.param('name');
    const channel = channels.get(name);
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
      const msg = channels.post(name, from, content, threadId);
      return c.json({ message: msg }, 201);
    } catch (err) {
      return c.json({ error: String(err) }, 500);
    }
  });

  return api;
}
