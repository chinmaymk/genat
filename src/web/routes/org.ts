import { Hono } from 'hono';
import { orgManager } from '../../core/org';

export function createOrgRoutes() {
  const api = new Hono();

  // GET / — list all org members and active agent IDs
  api.get('/', (c) => {
    const members = Array.from(orgManager.members.entries()).map(([, member]) => ({
      ...member,
    }));
    const agentIds = Array.from(orgManager.agents.keys());
    return c.json({ members, activeAgents: agentIds });
  });

  // GET /:id — fetch a single member with agent status and direct reports
  api.get('/:id', (c) => {
    const id = c.req.param('id');
    const member = orgManager.members.get(id);
    if (!member) {
      return c.json({ error: `Org member "${id}" not found` }, 404);
    }

    const agent = orgManager.agents.get(id);
    const directReports = orgManager.getDirectReports(id);

    return c.json({
      member,
      hasActiveAgent: !!agent,
      directReports,
    });
  });

  return api;
}
