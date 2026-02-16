import React from 'react';

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...opts?.headers },
    ...opts,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json() as Promise<T>;
}

export function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function statusBadge(status: string): React.ReactElement {
  const cls =
    status === 'open' || status === 'queued'
      ? 'badge-open'
      : status === 'done' || status === 'complete' || status === 'completed'
      ? 'badge-done'
      : status === 'in-progress' || status === 'in_progress' || status === 'claimed'
      ? 'badge-in-progress'
      : status === 'blocked'
      ? 'badge-blocked'
      : 'badge-default';

  return <span className={`badge ${cls}`}>{status}</span>;
}
