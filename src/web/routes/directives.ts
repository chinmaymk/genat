import { Hono } from 'hono';
import { channelManager } from '../../core/channel';
import { getTaskManager } from '../../core/task-manager';

export function createDirectivesRoutes() {
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

    if (!channelManager.get('company')) {
      channelManager.create('company');
    }

    const msg = channelManager.post('company', 'board', content);

    const task = (await getTaskManager()).create({
      type: 'directive',
      title: content.slice(0, 100),
      description: content,
      status: 'queued',
    });

    return c.json({ message: msg, task }, 201);
  });

  return api;
}
