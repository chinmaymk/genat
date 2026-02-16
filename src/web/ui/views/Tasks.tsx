import React from 'react';
import { apiFetch, statusBadge } from '../api';
import type { Task } from '../types';

const TYPE_ORDER: Record<string, number> = { directive: 0, epic: 1, story: 2, task: 3 };

export function TasksView() {
  const [tasks, setTasks] = React.useState<Task[]>([]);
  const [note, setNote] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ tasks: Task[]; note?: string }>('/tasks');
      setTasks(data.tasks);
      if (data.note) setNote(data.note);
    } catch {
      setNote('Could not load tasks');
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const sorted = [...tasks].sort((a, b) => (TYPE_ORDER[a.type] ?? 4) - (TYPE_ORDER[b.type] ?? 4));

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-title">Tasks</div>
        <div className="refresh-dot" />
      </div>

      {note && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16, fontStyle: 'italic' }}>{note}</div>
      )}

      {tasks.length === 0 ? (
        <div className="empty" style={{ padding: 64 }}>
          <div className="empty-icon">📋</div>
          <div className="empty-text">No tasks yet. Send a directive above to create one.</div>
        </div>
      ) : (
        sorted.map((task) => (
          <div key={task.id} className={`task-item ${task.type}`}>
            <div className="task-info">
              <div className="task-title">{task.title}</div>
              <div className="task-meta">
                {task.id.slice(0, 8)} · {task.type}
                {task.parentId && ` · parent: ${String(task.parentId).slice(0, 8)}`}
              </div>
            </div>
            {statusBadge(task.status)}
          </div>
        ))
      )}
    </div>
  );
}
