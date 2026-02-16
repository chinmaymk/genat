export const css = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg:         #0a0a0a;
    --card:       #1a1a2e;
    --accent:     #16213e;
    --highlight:  #0f3460;
    --alert:      #e94560;
    --text:       #e0e0e0;
    --text-muted: #888;
    --border:     #2a2a4a;
    --success:    #2ecc71;
    --warning:    #f39c12;
    --info:       #3498db;
  }

  html, body, #root {
    height: 100%;
    background: var(--bg);
    color: var(--text);
    font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
    font-size: 14px;
    line-height: 1.5;
  }

  ::-webkit-scrollbar { width: 6px; height: 6px; }
  ::-webkit-scrollbar-track { background: var(--bg); }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--highlight); }

  /* Layout */
  .layout { display: flex; flex-direction: column; height: 100%; }

  .header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 0 24px;
    height: 56px;
    background: var(--card);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    z-index: 10;
  }

  .header-title {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .header-title span { color: var(--alert); }

  .directive-form {
    display: flex;
    flex: 1;
    gap: 8px;
    max-width: 700px;
    margin-left: auto;
  }

  .directive-input {
    flex: 1;
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    padding: 6px 12px;
    outline: none;
    resize: none;
    height: 36px;
    font-family: inherit;
    transition: border-color 0.2s;
  }

  .directive-input:focus { border-color: var(--highlight); }
  .directive-input::placeholder { color: var(--text-muted); }

  .btn {
    padding: 6px 16px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    transition: opacity 0.2s, background 0.2s;
    white-space: nowrap;
  }

  .btn:hover { opacity: 0.85; }
  .btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .btn-primary { background: var(--alert); color: #fff; }
  .btn-secondary { background: var(--highlight); color: #fff; }
  .btn-ghost { background: transparent; color: var(--text-muted); border: 1px solid var(--border); }

  .body { display: flex; flex: 1; overflow: hidden; }

  /* Sidebar */
  .sidebar {
    width: 200px;
    flex-shrink: 0;
    background: var(--card);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    padding: 12px 0;
    overflow-y: auto;
  }

  .sidebar-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--text-muted);
    padding: 12px 16px 4px;
  }

  .nav-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 16px;
    cursor: pointer;
    color: var(--text-muted);
    border-radius: 0;
    transition: background 0.15s, color 0.15s;
    user-select: none;
    font-size: 13px;
  }

  .nav-item:hover { background: var(--accent); color: var(--text); }
  .nav-item.active { background: var(--highlight); color: #fff; }

  .nav-icon { font-size: 16px; width: 20px; text-align: center; }

  /* Main content */
  .main { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

  .view { flex: 1; overflow-y: auto; padding: 24px; }

  /* Cards */
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 16px;
  }

  .card-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-muted);
    margin-bottom: 12px;
  }

  /* Dashboard */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .stat-card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    text-align: center;
  }

  .stat-value {
    font-size: 36px;
    font-weight: 700;
    color: var(--alert);
    line-height: 1;
    margin-bottom: 6px;
  }

  .stat-label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Channels */
  .channels-layout {
    display: flex;
    gap: 16px;
    height: 100%;
    overflow: hidden;
  }

  .channel-list {
    width: 200px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .channel-item {
    padding: 8px 12px;
    border-radius: 6px;
    cursor: pointer;
    border: 1px solid transparent;
    transition: background 0.15s;
  }

  .channel-item:hover { background: var(--accent); }
  .channel-item.active { background: var(--highlight); border-color: var(--border); }

  .channel-name { font-weight: 600; font-size: 13px; }
  .channel-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  .channel-messages {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .channel-header {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .channel-msgs-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .msg {
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--accent);
    border-left: 3px solid var(--border);
  }

  .msg.from-board { border-left-color: var(--alert); }

  .msg-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 4px;
  }

  .msg-from {
    font-size: 12px;
    font-weight: 700;
    color: var(--info);
  }

  .msg-from.board { color: var(--alert); }

  .msg-time { font-size: 11px; color: var(--text-muted); }
  .msg-content { font-size: 13px; white-space: pre-wrap; word-break: break-word; }

  .msg-thread {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .msg-reply {
    margin-left: 20px;
    border-left-color: var(--info);
  }
  .msg-triaged {
    font-size: 11px;
    color: var(--text-muted);
    margin-left: auto;
  }

  .channel-input {
    display: flex;
    gap: 8px;
    padding: 12px 16px;
    border-top: 1px solid var(--border);
    background: var(--accent);
  }

  .channel-input textarea {
    flex: 1;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 6px;
    color: var(--text);
    font-size: 13px;
    padding: 8px 12px;
    resize: none;
    height: 60px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s;
  }

  .channel-input textarea:focus { border-color: var(--highlight); }
  .channel-input textarea::placeholder { color: var(--text-muted); }

  /* Tasks */
  .task-item {
    padding: 10px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    margin-bottom: 6px;
    background: var(--accent);
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .task-item.directive { border-left: 4px solid var(--alert); }
  .task-item.epic { border-left: 4px solid var(--info); margin-left: 16px; }
  .task-item.story { border-left: 4px solid var(--warning); margin-left: 32px; }
  .task-item.task { border-left: 4px solid var(--success); margin-left: 48px; }

  .task-info { flex: 1; min-width: 0; }
  .task-title { font-size: 13px; font-weight: 600; color: var(--text); }
  .task-meta { font-size: 11px; color: var(--text-muted); margin-top: 2px; }

  .badge {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    white-space: nowrap;
  }

  .badge-open { background: var(--highlight); color: #fff; }
  .badge-done { background: var(--success); color: #000; }
  .badge-in-progress { background: var(--warning); color: #000; }
  .badge-blocked { background: var(--alert); color: #fff; }
  .badge-default { background: var(--border); color: var(--text-muted); }

  /* Queues */
  .queue-card { margin-bottom: 20px; }

  .queue-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .queue-name { font-size: 15px; font-weight: 700; }

  .queue-stats { display: flex; gap: 12px; }

  .queue-stat {
    font-size: 11px;
    padding: 2px 8px;
    border-radius: 10px;
    background: var(--accent);
    border: 1px solid var(--border);
    color: var(--text-muted);
  }

  .work-item {
    padding: 10px 14px;
    border-radius: 6px;
    border: 1px solid var(--border);
    margin-bottom: 6px;
    background: var(--bg);
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .work-item.queued { border-left: 3px solid var(--info); }
  .work-item.claimed { border-left: 3px solid var(--warning); }
  .work-item.blocked { border-left: 3px solid var(--alert); }

  .work-item-body { flex: 1; min-width: 0; }
  .work-item-title { font-size: 13px; font-weight: 600; }
  .work-item-meta { font-size: 11px; color: var(--text-muted); margin-top: 3px; }

  /* Org */
  .org-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 16px;
  }

  .org-member {
    background: var(--accent);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 16px;
  }

  .org-member-id {
    font-size: 12px;
    font-weight: 700;
    color: var(--alert);
    margin-bottom: 8px;
    font-family: monospace;
  }

  .org-member-fields { display: flex; flex-direction: column; gap: 4px; }

  .org-field {
    display: flex;
    gap: 6px;
    font-size: 12px;
  }

  .org-field-key { color: var(--text-muted); min-width: 60px; }
  .org-field-val { color: var(--text); word-break: break-all; }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px;
    color: var(--text-muted);
    text-align: center;
    gap: 8px;
  }

  .empty-icon { font-size: 32px; }
  .empty-text { font-size: 13px; }

  /* Refresh indicator */
  .refresh-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--success);
    flex-shrink: 0;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* View header */
  .view-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 20px;
  }

  .view-title { font-size: 20px; font-weight: 700; }

  .channels-view {
    display: flex;
    flex: 1;
    gap: 16px;
    overflow: hidden;
    height: calc(100vh - 56px - 48px);
  }
`;
