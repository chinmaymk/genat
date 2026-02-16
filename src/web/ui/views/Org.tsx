import React from 'react';
import { apiFetch } from '../api';
import type { OrgMember } from '../types';

export function OrgView() {
  const [members, setMembers] = React.useState<OrgMember[]>([]);
  const [note, setNote] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ members: OrgMember[]; note?: string }>('/org');
      setMembers(data.members);
      if (data.note) setNote(data.note);
    } catch {
      setNote('Could not load org data');
    }
  }, []);

  React.useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="view">
      <div className="view-header">
        <div className="view-title">Org Chart</div>
        <div className="refresh-dot" />
      </div>

      {note && (
        <div style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 16, fontStyle: 'italic' }}>{note}</div>
      )}

      {members.length === 0 ? (
        <div className="empty" style={{ padding: 64 }}>
          <div className="empty-icon">🏢</div>
          <div className="empty-text">No agents running yet.</div>
        </div>
      ) : (
        <div className="org-grid">
          {members.map((m) => {
            const fields = Object.entries(m).filter(([k]) => k !== 'id');
            return (
              <div key={m.id} className="org-member">
                <div className="org-member-id">{m.id}</div>
                <div className="org-member-fields">
                  {fields.map(([k, v]) => (
                    <div key={k} className="org-field">
                      <span className="org-field-key">{k}:</span>
                      <span className="org-field-val">
                        {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
