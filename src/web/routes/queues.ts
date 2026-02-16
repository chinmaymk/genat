import { Hono } from 'hono';
import { workQueueManager } from '../../core/work-queue';

export function createQueuesRoutes() {
  const api = new Hono();

  // GET / — list all queues with counts by status
  api.get('/', (c) => {
    const names = workQueueManager.list();
    const queues = names.map((name) => {
      const q = workQueueManager.get(name)!;
      const items = q.list();
      return {
        name,
        total: items.length,
        queued: items.filter((i) => i.status === 'queued').length,
        claimed: items.filter((i) => i.status === 'claimed').length,
        blocked: items.filter((i) => i.status === 'blocked').length,
      };
    });
    return c.json({ queues });
  });

  // GET /:name — fetch all items in a queue (optional ?status=queued|claimed|blocked)
  api.get('/:name', (c) => {
    const name = c.req.param('name');
    const queue = workQueueManager.get(name);
    if (!queue) {
      return c.json({ error: `Queue "${name}" not found` }, 404);
    }

    const statusParam = c.req.query('status') as 'queued' | 'claimed' | 'blocked' | undefined;
    const items = queue.list(statusParam);
    return c.json({ name, items });
  });

  return api;
}
