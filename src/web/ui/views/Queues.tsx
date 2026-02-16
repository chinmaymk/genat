import React from 'react';
import { apiFetch, statusBadge } from '../api';
import type { QueueSummary, QueueDetail, WorkItem } from '../types';

export function QueuesView() {
  const [queues, setQueues] = React.useState<QueueSummary[]>([]);
  const [details, setDetails] = React.useState<Record<string, WorkItem[]>>({});

  const load = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ queues: QueueSummary[] }>('/queues');
      setQueues(data.queues);

      const detailMap: Record<string, WorkItem[]> = {};
      await Promise.all(
        data.queues.map(async (q) => {
          try {
            const d = await apiFetch<QueueDetail>(`/queues/${q.name}`);
            detailMap[q.name] = d.items;
          } catch {
            detailMap[q.name] = [];
          }
        })
      );
      setDetails(detailMap);
    } catch {
      // ignore
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  if (queues.length === 0) {
    return (
      <div className="view">
        <div className="view-header">
          <div className="view-title">Work Queues</div>
          <div className="refresh-dot" />
        </div>
        <div className="empty" style={{ padding: 64 }}>
          <div className="empty-icon">📬</div>
          <div className="empty-text">No work queues yet.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-title">Work Queues</div>
        <div className="refresh-dot" />
      </div>

      {queues.map((q) => {
        const items = details[q.name] || [];
        return (
          <div key={q.name} className="card queue-card">
            <div className="queue-header">
              <div className="queue-name">{q.name}</div>
              <div className="queue-stats">
                <span className="queue-stat">{q.queued} queued</span>
                <span className="queue-stat">{q.claimed} claimed</span>
                <span className="queue-stat">{q.blocked} blocked</span>
              </div>
            </div>

            {items.length === 0 ? (
              <div style={{ color: 'var(--text-muted)', fontSize: 12, fontStyle: 'italic' }}>Empty queue</div>
            ) : (
              items.map((item) => (
                <div key={item.id} className={`work-item ${item.status}`}>
                  <div className="work-item-body">
                    <div className="work-item-title">{item.title}</div>
                    <div className="work-item-meta">
                      Priority: {item.priority} · {item.id.slice(0, 8)}
                      {item.claimedBy && ` · claimed by ${item.claimedBy}`}
                      {item.blockedReason && ` · blocked: ${item.blockedReason}`}
                    </div>
                  </div>
                  {statusBadge(item.status)}
                </div>
              ))
            )}
          </div>
        );
      })}
    </div>
  );
}
