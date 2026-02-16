import React from 'react';
import { apiFetch, formatTime } from '../api';
import type { ChannelSummary, ChannelDetail, ChannelMessage } from '../types';

export function ChannelsView() {
  const [channels, setChannels] = React.useState<ChannelSummary[]>([]);
  const [selected, setSelected] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<ChannelDetail | null>(null);
  const [msgText, setMsgText] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const msgsEndRef = React.useRef<HTMLDivElement>(null);

  const loadChannels = React.useCallback(async () => {
    try {
      const data = await apiFetch<{ channels: ChannelSummary[] }>('/channels');
      setChannels(data.channels);
      if (!selected && data.channels.length > 0) {
        setSelected(data.channels[0].name);
      }
    } catch {
      // ignore
    }
  }, [selected]);

  const loadDetail = React.useCallback(async () => {
    if (!selected) return;
    try {
      const data = await apiFetch<ChannelDetail>(`/channels/${selected}`);
      setDetail(data);
    } catch {
      // ignore
    }
  }, [selected]);

  React.useEffect(() => {
    loadChannels();
    const t = setInterval(loadChannels, 3000);
    return () => clearInterval(t);
  }, [loadChannels]);

  React.useEffect(() => {
    loadDetail();
    const t = setInterval(loadDetail, 3000);
    return () => clearInterval(t);
  }, [loadDetail]);

  React.useEffect(() => {
    msgsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [detail?.messages.length]);

  const sendMessage = async () => {
    if (!selected || !msgText.trim()) return;
    setSending(true);
    try {
      await apiFetch(`/channels/${selected}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: msgText.trim() }),
      });
      setMsgText('');
      await loadDetail();
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="view" style={{ display: 'flex', flexDirection: 'column', height: '100%', paddingBottom: 0 }}>
      <div className="view-header">
        <div className="view-title">Channels</div>
        <div className="refresh-dot" title="Live polling every 3s" />
      </div>

      <div className="channels-view">
        <div className="channel-list">
          {channels.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '8px 12px' }}>No channels</div>
          ) : (
            channels.map((ch) => (
              <div
                key={ch.name}
                className={`channel-item ${selected === ch.name ? 'active' : ''}`}
                onClick={() => setSelected(ch.name)}
              >
                <div className="channel-name">#{ch.name}</div>
                <div className="channel-meta">{ch.messageCount} msg · {ch.subscribers.length} sub</div>
              </div>
            ))
          )}
        </div>

        {selected && detail ? (
          <div className="channel-messages">
            <div className="channel-header">
              <span>#{detail.name}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 4 }}>
                {detail.subscribers.length} subscribers
              </span>
            </div>

            <div className="channel-msgs-list">
              {detail.messages.length === 0 ? (
                <div className="empty">
                  <div className="empty-icon">💬</div>
                  <div className="empty-text">No messages yet</div>
                </div>
              ) : (
                (() => {
                  const triagedBy = detail.triagedBy ?? {};
                  const roots = detail.messages.filter((m) => !m.threadId).sort((a, b) => a.timestamp - b.timestamp);
                  const byThread = new Map<string, ChannelMessage[]>();
                  for (const m of detail.messages) {
                    if (m.threadId) {
                      const list = byThread.get(m.threadId) ?? [];
                      list.push(m);
                      byThread.set(m.threadId, list);
                    }
                  }
                  for (const list of byThread.values()) list.sort((a, b) => a.timestamp - b.timestamp);
                  return roots.map((root) => (
                    <div key={root.id} className="msg-thread">
                      <div className={`msg msg-root ${root.from === 'board' ? 'from-board' : ''}`}>
                        <div className="msg-header">
                          <span className={`msg-from ${root.from === 'board' ? 'board' : ''}`}>{root.from}</span>
                          <span className="msg-time">{formatTime(root.timestamp)}</span>
                          {triagedBy[root.id] && (
                            <span className="msg-triaged" title="Being handled">🔄 {triagedBy[root.id]}</span>
                          )}
                        </div>
                        <div className="msg-content">{root.content}</div>
                      </div>
                      {(byThread.get(root.id) ?? []).map((reply) => (
                        <div key={reply.id} className={`msg msg-reply ${reply.from === 'board' ? 'from-board' : ''}`}>
                          <div className="msg-header">
                            <span className={`msg-from ${reply.from === 'board' ? 'board' : ''}`}>{reply.from}</span>
                            <span className="msg-time">{formatTime(reply.timestamp)}</span>
                          </div>
                          <div className="msg-content">{reply.content}</div>
                        </div>
                      ))}
                    </div>
                  ));
                })()
              )}
              <div ref={msgsEndRef} />
            </div>

            <div className="channel-input">
              <textarea
                placeholder={`Message #${selected} as board... (Enter to send)`}
                value={msgText}
                onChange={(e) => setMsgText(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button className="btn btn-primary" onClick={sendMessage} disabled={sending || !msgText.trim()}>
                Send
              </button>
            </div>
          </div>
        ) : (
          <div className="channel-messages" style={{ alignItems: 'center', justifyContent: 'center', display: 'flex' }}>
            <div className="empty">
              <div className="empty-icon">📡</div>
              <div className="empty-text">Select a channel</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
