import { Hono } from 'hono';
import { getTaskManager } from '../../core/task-manager';
import type { TaskType, TaskStatus } from '../../core/task-manager';

export function createTasksRoutes() {
  const api = new Hono();

  // GET / — list tasks with optional type/status filter
  api.get('/', async (c) => {
    const type = c.req.query('type') as TaskType | undefined;
    const status = c.req.query('status') as TaskStatus | undefined;

    const filter: { type?: TaskType; status?: TaskStatus } = {};
    if (type) filter.type = type;
    if (status) filter.status = status;

    const tasks = (await getTaskManager()).list(Object.keys(filter).length > 0 ? filter : undefined);
    return c.json({ tasks });
  });

  // GET /:id — fetch a single task
  api.get('/:id', async (c) => {
    const id = c.req.param('id');
    const task = (await getTaskManager()).get(id);
    if (!task) {
      return c.json({ error: `Task "${id}" not found` }, 404);
    }
    return c.json({ task });
  });

  return api;
}
