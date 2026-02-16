import { Hono } from 'hono';
import { createDirectivesRoutes } from './directives';
import { createTasksRoutes } from './tasks';
import { createChannelsRoutes } from './channels';
import { createQueuesRoutes } from './queues';
import { createOrgRoutes } from './org';

export function createRoutes() {
  const api = new Hono();

  api.route('/directives', createDirectivesRoutes());
  api.route('/tasks', createTasksRoutes());
  api.route('/channels', createChannelsRoutes());
  api.route('/queues', createQueuesRoutes());
  api.route('/org', createOrgRoutes());

  return api;
}
