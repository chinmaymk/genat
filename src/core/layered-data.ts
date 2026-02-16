import { MemoryStore, type Memory } from '../memory/store';
import { TaskManager, type Task } from './task-manager';

export type DataSource = 'user' | 'agent';

function mergeLists<T extends { id: string }>(
  primary: T[],
  secondary: T[],
  opts?: { limit?: number; sort?: boolean }
): T[] {
  const seen = new Set<string>(primary.map(t => t.id));
  const merged = [...primary];
  for (const item of secondary) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  if (opts?.sort) {
    merged.sort((a, b) => ((a as any).createdAt ?? 0) - ((b as any).createdAt ?? 0));
  }
  if (opts?.limit !== undefined) {
    return merged.slice(0, opts.limit);
  }
  return merged;
}

export function createLayeredMemoryStore(userDbPath: string, agentDbPath: string) {
  const userStore = new MemoryStore(userDbPath);
  const agentStore = new MemoryStore(agentDbPath);

  return {
    init(): void {
      userStore.init();
      agentStore.init();
    },

    store(agentId: string, content: string, type: Memory['type'], source: DataSource = 'agent'): Memory {
      if (source === 'user') return userStore.store(agentId, content, type);
      return agentStore.store(agentId, content, type);
    },

    search(agentId: string, query: string, limit: number = 10): Memory[] {
      return mergeLists(userStore.search(agentId, query, limit), agentStore.search(agentId, query, limit), { limit });
    },

    getRecent(agentId: string, limit: number = 20): Memory[] {
      return mergeLists(userStore.getRecent(agentId, limit), agentStore.getRecent(agentId, limit), { limit });
    },
  };
}

export type LayeredMemoryStore = ReturnType<typeof createLayeredMemoryStore>;

export function createLayeredTaskManager(userDbPath: string, agentDbPath: string) {
  const userManager = new TaskManager(userDbPath);
  const agentManager = new TaskManager(agentDbPath);

  return {
    init(): void {
      userManager.init();
      agentManager.init();
    },

    create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>, source: DataSource = 'agent'): Task {
      if (source === 'user') return userManager.create(task);
      return agentManager.create(task);
    },

    update(id: string, updates: Partial<Task>): Task {
      const fromUser = userManager.get(id);
      if (fromUser) return userManager.update(id, updates);
      const fromAgent = agentManager.get(id);
      if (fromAgent) return agentManager.update(id, updates);
      throw new Error(`Task "${id}" not found`);
    },

    get(id: string): Task | null {
      const fromUser = userManager.get(id);
      if (fromUser) return fromUser;
      return agentManager.get(id);
    },

    getChildren(parentId: string): Task[] {
      return mergeLists(userManager.getChildren(parentId), agentManager.getChildren(parentId), { sort: true });
    },

    getByStatus(status: Task['status']): Task[] {
      return mergeLists(userManager.getByStatus(status), agentManager.getByStatus(status), { sort: true });
    },

    getByAssignee(assignee: string): Task[] {
      return mergeLists(userManager.getByAssignee(assignee), agentManager.getByAssignee(assignee), { sort: true });
    },

    list(filter?: { type?: Task['type']; status?: Task['status']; parentId?: string }): Task[] {
      return mergeLists(userManager.list(filter), agentManager.list(filter), { sort: true });
    },
  };
}

export type LayeredTaskManager = ReturnType<typeof createLayeredTaskManager>;
