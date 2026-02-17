import { Hono } from 'hono';
import type { Org } from '../../core/org';

const TEAM_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

function validateTeamName(name: string): boolean {
  return name.length > 0 && name.length <= 128 && TEAM_NAME_REGEX.test(name);
}

export function createMemoriesRoutes(org: Org) {
  const api = new Hono();

  // GET / — list team names that have memory (from org config)
  api.get('/teams', async (c) => {
    const teams = await org.listTeamNames();
    return c.json({ teams });
  });

  // GET /teams/:teamName — recent memories for a team
  api.get('/teams/:teamName', (c) => {
    const teamName = c.req.param('teamName');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    const limit = Math.min(500, Math.max(1, parseInt(c.req.query('limit') ?? '200', 10) || 200));
    const memory = org.getTeamMemory(teamName);
    const memories = memory.recent(limit);
    return c.json({ team: teamName, memories });
  });

  // GET /teams/:teamName/search — search memories
  api.get('/teams/:teamName/search', (c) => {
    const teamName = c.req.param('teamName');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    const q = c.req.query('q')?.trim();
    if (!q) {
      return c.json({ error: 'Query "q" is required' }, 400);
    }
    const type = c.req.query('type') || undefined;
    const limit = Math.min(50, Math.max(1, parseInt(c.req.query('limit') ?? '20', 10) || 20));
    const memory = org.getTeamMemory(teamName);
    const memories = memory.search(q, { type, limit });
    return c.json({ team: teamName, memories });
  });

  // POST /teams/:teamName — create memory
  api.post('/teams/:teamName', async (c) => {
    const teamName = c.req.param('teamName');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    let body: { type?: string; content?: string; tags?: string; agentId?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const type = body?.type?.trim();
    const content = body?.content?.trim();
    if (!type || !content) {
      return c.json({ error: 'type and content are required' }, 400);
    }
    const allowedTypes = ['decision', 'lesson', 'fact'];
    if (!allowedTypes.includes(type)) {
      return c.json({ error: 'type must be one of: decision, lesson, fact' }, 400);
    }
    const tags = typeof body?.tags === 'string' ? body.tags.trim() : '';
    const agentId = body?.agentId?.trim() || 'board';
    const mem = org.getTeamMemory(teamName);
    const id = mem.save(agentId, type, content, tags);
    const memory = mem.get(id)!;
    return c.json({ memory }, 201);
  });

  // GET /teams/:teamName/memories/:id — get one memory
  api.get('/teams/:teamName/memories/:id', (c) => {
    const teamName = c.req.param('teamName');
    const id = c.req.param('id');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    if (!id) return c.json({ error: 'Memory id is required' }, 400);
    const mem = org.getTeamMemory(teamName);
    const memory = mem.get(id);
    if (!memory) return c.json({ error: 'Memory not found' }, 404);
    return c.json({ memory });
  });

  // PUT /teams/:teamName/memories/:id — update memory
  api.put('/teams/:teamName/memories/:id', async (c) => {
    const teamName = c.req.param('teamName');
    const id = c.req.param('id');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    if (!id) return c.json({ error: 'Memory id is required' }, 400);
    let body: { type?: string; content?: string; tags?: string };
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Invalid JSON body' }, 400);
    }
    const mem = org.getTeamMemory(teamName);
    const payload: { type?: string; content?: string; tags?: string } = {};
    if (body?.type !== undefined) {
      const type = String(body.type).trim();
      if (!['decision', 'lesson', 'fact'].includes(type)) {
        return c.json({ error: 'type must be one of: decision, lesson, fact' }, 400);
      }
      payload.type = type;
    }
    if (body?.content !== undefined) payload.content = String(body.content).trim();
    if (body?.tags !== undefined) payload.tags = String(body.tags).trim();
    const ok = mem.update(id, payload);
    if (!ok) return c.json({ error: 'Memory not found' }, 404);
    const memory = mem.get(id)!;
    return c.json({ memory });
  });

  // DELETE /teams/:teamName/memories/:id — delete memory
  api.delete('/teams/:teamName/memories/:id', (c) => {
    const teamName = c.req.param('teamName');
    const id = c.req.param('id');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    if (!id) return c.json({ error: 'Memory id is required' }, 400);
    const mem = org.getTeamMemory(teamName);
    const existing = mem.get(id);
    if (!existing) return c.json({ error: 'Memory not found' }, 404);
    mem.delete(id);
    return c.json({ deleted: true });
  });

  // DELETE /teams/:teamName/all — delete all memories for the team
  api.delete('/teams/:teamName/all', (c) => {
    const teamName = c.req.param('teamName');
    if (!validateTeamName(teamName)) {
      return c.json({ error: 'Invalid team name' }, 400);
    }
    const mem = org.getTeamMemory(teamName);
    const deleted = mem.deleteAll();
    return c.json({ deleted: true, count: deleted });
  });

  return api;
}
