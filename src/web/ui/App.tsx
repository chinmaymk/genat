import React from 'react';
import { apiFetch } from './api';
import type { View } from './types';
import { DashboardView } from './views/Dashboard';
import { ChannelsView } from './views/Channels';
import { OrgView } from './views/Org';
import { MemoriesView } from './views/Memories';

const NAV_ITEMS: { id: View; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '⬛' },
  { id: 'channels', label: 'Channels', icon: '💬' },
  { id: 'org', label: 'Org Chart', icon: '🏢' },
  { id: 'memories', label: 'Memories', icon: '🧠' },
];

export function App() {
  const [view, setView] = React.useState<View>('dashboard');
  const [directive, setDirective] = React.useState('');
  const [sending, setSending] = React.useState(false);

  const sendDirective = async () => {
    const content = directive.trim();
    if (!content) return;
    setSending(true);
    try {
      await apiFetch('/directives', {
        method: 'POST',
        body: JSON.stringify({ content }),
      });
      setDirective('');
    } catch (err) {
      console.error('Failed to send directive:', err);
    } finally {
      setSending(false);
    }
  };

  const handleDirectiveKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendDirective();
    }
  };

  return (
    <div className="layout">
      <header className="header">
        <div className="header-title">
          Agent<span>Corp</span>
        </div>
        <div className="directive-form">
          <textarea
            className="directive-input"
            placeholder="Send a directive to the company... (Enter to send)"
            value={directive}
            onChange={(e) => setDirective(e.target.value)}
            onKeyDown={handleDirectiveKey}
          />
          <button className="btn btn-primary" onClick={sendDirective} disabled={sending || !directive.trim()}>
            {sending ? 'Sending...' : 'Send Directive'}
          </button>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar">
          <div className="sidebar-label">Navigation</div>
          {NAV_ITEMS.map((item) => (
            <div
              key={item.id}
              className={`nav-item ${view === item.id ? 'active' : ''}`}
              onClick={() => setView(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
            </div>
          ))}
        </nav>

        <main className="main">
          {view === 'dashboard' && <DashboardView />}
          {view === 'channels' && <ChannelsView />}
          {view === 'org' && <OrgView />}
          {view === 'memories' && <MemoriesView />}
        </main>
      </div>
    </div>
  );
}
