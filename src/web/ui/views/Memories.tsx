import React from 'react';
import { apiFetch } from '../api';
import type { Memory } from '../types';

const MEMORY_TYPES = ['decision', 'lesson', 'fact'] as const;

function formatDateTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

export function MemoriesView() {
  const [teams, setTeams] = React.useState<string[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [memories, setMemories] = React.useState<Memory[]>([]);
  const [searchQ, setSearchQ] = React.useState('');
  const [searchMode, setSearchMode] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [showCreate, setShowCreate] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [createForm, setCreateForm] = React.useState({ type: 'fact', content: '', tags: '' });
  const [editForm, setEditForm] = React.useState({ type: 'fact', content: '', tags: '' });
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const loadTeams = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ teams: string[] }>('/memories/teams');
      setTeams(data.teams);
      if (!selected && data.teams.length > 0) {
        setSelected(data.teams[0]);
      }
    } catch {
      setTeams([]);
    }
  }, [selected]);

  const loadMemories = React.useCallback(async () => {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      if (searchMode && searchQ.trim()) {
        const data = await apiFetch<{ memories: Memory[] }>(
          `/memories/teams/${encodeURIComponent(selected)}/search?q=${encodeURIComponent(searchQ.trim())}&limit=100`
        );
        setMemories(data.memories);
      } else {
        const data = await apiFetch<{ memories: Memory[] }>(
          `/memories/teams/${encodeURIComponent(selected)}?limit=500`
        );
        setMemories(data.memories);
      }
    } catch (e) {
      setMemories([]);
      setError(e instanceof Error ? e.message : 'Failed to load memories');
    } finally {
      setLoading(false);
    }
  }, [selected, searchMode, searchQ]);

  React.useEffect(() => {
    loadTeams();
    const t = setInterval(loadTeams, 5000);
    return () => clearInterval(t);
  }, [loadTeams]);

  React.useEffect(() => {
    loadMemories();
    const t = setInterval(() => {
      if (!searchMode) loadMemories();
    }, 5000);
    return () => clearInterval(t);
  }, [loadMemories]);

  const runSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQ.trim()) {
      setSearchMode(true);
      loadMemories();
    } else {
      setSearchMode(false);
      loadMemories();
    }
  };

  const clearSearch = () => {
    setSearchQ('');
    setSearchMode(false);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !createForm.content.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<{ memory: Memory }>(`/memories/teams/${encodeURIComponent(selected)}`, {
        method: 'POST',
        body: JSON.stringify({
          type: createForm.type,
          content: createForm.content.trim(),
          tags: createForm.tags.trim(),
          agentId: 'board',
        }),
      });
      setCreateForm({ type: 'fact', content: '', tags: '' });
      setShowCreate(false);
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create memory');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (m: Memory) => {
    setEditingId(m.id);
    setEditForm({ type: m.type, content: m.content, tags: m.tags });
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || !editingId) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch<{ memory: Memory }>(
        `/memories/teams/${encodeURIComponent(selected)}/memories/${encodeURIComponent(editingId)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            type: editForm.type,
            content: editForm.content.trim(),
            tags: editForm.tags.trim(),
          }),
        }
      );
      setEditingId(null);
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update memory');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!selected || !confirm('Delete this memory?')) return;
    setError(null);
    try {
      await apiFetch(`/memories/teams/${encodeURIComponent(selected)}/memories/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      });
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete memory');
    }
  };

  const handleDeleteAll = async () => {
    if (!selected || !confirm('Delete all memories in this team? This cannot be undone.')) return;
    setError(null);
    try {
      await apiFetch<{ count: number }>(`/memories/teams/${encodeURIComponent(selected)}/all`, {
        method: 'DELETE',
      });
      await loadMemories();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete all memories');
    }
  };

  return (
    <div className="view" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="view-header">
        <div className="view-title">Memories</div>
        <div className="refresh-dot" title="Polls every 5s" />
      </div>

      <div className="channels-view">
        <div className="channel-list">
          {teams.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>No teams</div>
          ) : (
            teams.map((name) => (
              <div
                key={name}
                className={`channel-item ${selected === name ? 'active' : ''}`}
                onClick={() => {
                  setSelected(name);
                  setSearchMode(false);
                  setSearchQ('');
                  setShowCreate(false);
                  setEditingId(null);
                }}
              >
                <div className="channel-name">{name}</div>
              </div>
            ))
          )}
        </div>

        {selected ? (
          <div className="channel-messages" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="channel-header" style={{ flexShrink: 0 }}>
              <span>{selected}</span>
              <form onSubmit={runSearch} style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
                <input
                  type="search"
                  placeholder="Search memories..."
                  value={searchQ}
                  onChange={(e) => setSearchQ(e.target.value)}
                  style={{ flex: 1, padding: '6px 10px', fontSize: 13 }}
                />
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  Search
                </button>
                {searchMode && (
                  <button type="button" className="btn" onClick={clearSearch}>
                    Clear
                  </button>
                )}
              </form>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setShowCreate(true);
                    setEditingId(null);
                  }}
                >
                  New memory
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleDeleteAll}
                  disabled={memories.length === 0}
                  title="Delete all memories in this team"
                >
                  Delete all
                </button>
              </div>
            </div>

            {error && (
              <div style={{ padding: '8px 12px', background: 'var(--bg-muted)', color: 'var(--text-muted)', fontSize: 12 }}>
                {error}
              </div>
            )}

            {showCreate && (
              <div className="card" style={{ margin: 12, padding: 12 }}>
                <div style={{ fontWeight: 600, marginBottom: 8 }}>New memory</div>
                <form onSubmit={handleCreate}>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Type</label>
                    <select
                      value={createForm.type}
                      onChange={(e) => setCreateForm((f) => ({ ...f, type: e.target.value }))}
                      style={{ padding: '6px 8px', width: '100%', maxWidth: 160 }}
                    >
                      {MEMORY_TYPES.map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Content</label>
                    <textarea
                      value={createForm.content}
                      onChange={(e) => setCreateForm((f) => ({ ...f, content: e.target.value }))}
                      placeholder="Memory content..."
                      rows={3}
                      required
                      style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Tags (optional)</label>
                    <input
                      type="text"
                      value={createForm.tags}
                      onChange={(e) => setCreateForm((f) => ({ ...f, tags: e.target.value }))}
                      placeholder="e.g. api, rate-limits"
                      style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button type="submit" className="btn btn-primary" disabled={saving}>
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" className="btn" onClick={() => setShowCreate(false)}>
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: 12 }}>
              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div>
              ) : memories.length === 0 && !showCreate ? (
                <div className="empty">
                  <div className="empty-icon">🧠</div>
                  <div className="empty-text">
                    {searchMode ? 'No matching memories' : 'No memories yet for this team'}
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {memories.map((m) => (
                    <div key={m.id} className="card" style={{ padding: 12 }}>
                      {editingId === m.id ? (
                        <form onSubmit={handleUpdate}>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Type</label>
                            <select
                              value={editForm.type}
                              onChange={(e) => setEditForm((f) => ({ ...f, type: e.target.value }))}
                              style={{ padding: '6px 8px', width: '100%', maxWidth: 160 }}
                            >
                              {MEMORY_TYPES.map((t) => (
                                <option key={t} value={t}>{t}</option>
                              ))}
                            </select>
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Content</label>
                            <textarea
                              value={editForm.content}
                              onChange={(e) => setEditForm((f) => ({ ...f, content: e.target.value }))}
                              rows={3}
                              required
                              style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                            />
                          </div>
                          <div style={{ marginBottom: 8 }}>
                            <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>Tags</label>
                            <input
                              type="text"
                              value={editForm.tags}
                              onChange={(e) => setEditForm((f) => ({ ...f, tags: e.target.value }))}
                              style={{ width: '100%', padding: '6px 8px', fontSize: 13 }}
                            />
                          </div>
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button type="submit" className="btn btn-primary" disabled={saving}>
                              {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button type="button" className="btn" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </form>
                      ) : (
                        <>
                          <div className="msg-header" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                            <span className={`badge badge-${m.type === 'decision' ? 'open' : m.type === 'lesson' ? 'in-progress' : 'default'}`}>
                              {m.type}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.agentId}</span>
                            <span className="msg-time" style={{ marginLeft: 'auto' }}>{formatDateTime(m.createdAt)}</span>
                            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => startEdit(m)}>
                              Edit
                            </button>
                            <button type="button" className="btn" style={{ padding: '2px 8px', fontSize: 12 }} onClick={() => handleDelete(m.id)}>
                              Delete
                            </button>
                          </div>
                          <div className="msg-content" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {m.content}
                          </div>
                          {m.tags && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                              tags: {m.tags}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="channel-messages" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <div className="empty">
              <div className="empty-icon">🧠</div>
              <div className="empty-text">Select a team</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
