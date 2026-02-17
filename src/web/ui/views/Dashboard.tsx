import React from 'react';
import { apiFetch, formatTime } from '../api';
import type { ChannelSummary, ChannelMessage, OrgMember } from '../types';

export function DashboardView() {
  const [stats, setStats] = React.useState({ agents: 0, channels: 0 });
  const [activity, setActivity] = React.useState<ChannelMessage[]>([]);

  const load = React.useCallback(async () => {
    try {
      const [chData, orgData] = await Promise.all([
        apiFetch<{ channels: ChannelSummary[] }>('/channels'),
        apiFetch<{ members: OrgMember[] }>('/org').catch(() => ({ members: [] })),
      ]);
      setStats({ agents: orgData.members.length, channels: chData.channels.length });
      const msgs: ChannelMessage[] = [];
      for (const ch of chData.channels) {
        if (ch.latestMessage) msgs.push(ch.latestMessage);
      }
      msgs.sort((a, b) => b.timestamp - a.timestamp);
      setActivity(msgs.slice(0, 10));
    } catch { /* ignore */ }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-title">Dashboard</div>
        <div className="refresh-dot" title="Live polling every 3s" />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.agents}</div>
          <div className="stat-label">Active Agents</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.channels}</div>
          <div className="stat-label">Open Channels</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent Activity</div>
        {activity.length === 0 ? (
          <div className="empty">
            <div className="empty-icon">📭</div>
            <div className="empty-text">No recent activity</div>
          </div>
        ) : (
          activity.map((msg) => (
            <div key={msg.id} className={`msg ${msg.from === 'board' ? 'from-board' : ''}`} style={{ marginBottom: 8 }}>
              <div className="msg-header">
                <span className={`msg-from ${msg.from === 'board' ? 'board' : ''}`}>{msg.from}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>#{msg.channel}</span>
                <span className="msg-time">{formatTime(msg.timestamp)}</span>
              </div>
              <div className="msg-content">{msg.content}</div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
