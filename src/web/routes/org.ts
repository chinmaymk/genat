import { Hono } from 'hono';
import type { Org } from '../../core/org';

export function createOrgRoutes(org: Org) {
  const api = new Hono();

  // GET / — list all org members and active agent IDs
  api.get('/', (c) => {
    const members = Array.from(org.getMembers().entries()).map(([, m]) => ({ ...m }));
    const agentIds = Array.from(org.getAgents().keys());
    return c.json({ members, activeAgents: agentIds });
  });

  // GET /:id — fetch a single member with agent status and direct reports
  api.get('/:id', (c) => {
    const id = c.req.param('id');
    const member = org.getMembers().get(id);
    if (!member) {
      return c.json({ error: `Org member "${id}" not found` }, 404);
    }

    const directReports = org.getDirectReports(id);

    return c.json({
      member,
      hasActiveAgent: !!org.getAgent(id),
      directReports,
    });
  });

  return api;
}
