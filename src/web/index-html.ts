export function getIndexHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>genat</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

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
    }

    html, body {
      height: 100%;
      background: var(--bg);
      color: var(--text);
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      font-size: 14px;
      line-height: 1.5;
    }

    #root {
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--highlight); }

    /* Loading state */
    .loading-screen {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      flex-direction: column;
      gap: 16px;
      color: var(--text-muted);
    }

    .loading-screen .spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--border);
      border-top-color: var(--alert);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div id="root">
    <div class="loading-screen">
      <div class="spinner"></div>
      <span>Loading genat...</span>
    </div>
  </div>
  <script type="module" src="/assets/index.js"></script>
</body>
</html>`;
}
