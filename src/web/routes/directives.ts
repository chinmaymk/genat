import { Hono } from 'hono';
import { ChannelManager } from '../../core/channel';

export function createDirectivesRoutes(channels: ChannelManager) {
  const api = new Hono();

  // POST / — board sends a high-level directive into #company
  api.post('/', async (c) => {
    let body: { content?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }

    const content = body?.content?.trim();
    if (!content) {
      return c.json({ error: 'content is required' }, 400);
    }

    if (!channels.get('company')) channels.create('company');
    const msg = channels.post('company', 'board', content);

    return c.json({ message: msg }, 201);
  });

  return api;
}
