# HTML Boilerplate & Theme Tokens Reference

This document provides self-contained HTML/CSS templates optimized for MCP Apps iframes across dark and light modes.

---

## 1. Universal Theme Tokens Mapping

Host applications inject different CSS variables into iframes. Use this resilient CSS custom properties cascade to guarantee proper contrast regardless of the host:

```css
:root {
  /* Surface & Background */
  --app-bg: var(--background, #ffffff);
  --card-bg: var(--card, #f8fafc);
  --border-color: var(--border, #e2e8f0);

  /* Typography */
  --text-main: var(--foreground, #0f172a);
  --text-muted: var(--muted-foreground, #64748b);

  /* Accents & States */
  --primary-color: var(--primary, #2563eb);
  --primary-text: var(--primary-foreground, #ffffff);
  --hover-bg: rgba(148, 163, 184, 0.12);
}

@media (prefers-color-scheme: dark) {
  :root {
    --app-bg: var(--background, #0f172a);
    --card-bg: var(--card, #1e293b);
    --border-color: var(--border, #334155);
    --text-main: var(--foreground, #f8fafc);
    --text-muted: var(--muted-foreground, #94a3b8);
  }
}
```

---

## 2. Standard Responsive Card Template

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Insert Theme Tokens here */
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 12px;
    }
    .mcp-card {
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 16px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
      max-width: 720px;
      margin: 0 auto;
    }
    .mcp-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }
    .mcp-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-main);
    }
    .mcp-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 9999px;
      background: var(--hover-bg);
      color: var(--text-muted);
    }
    .btn-primary {
      background: var(--primary-color);
      color: var(--primary-text);
      border: none;
      border-radius: 6px;
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: opacity 0.15s ease;
    }
    .btn-primary:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="mcp-card">
    <div class="mcp-header">
      <h3 class="mcp-title" id="widget-title">交互组件标题</h3>
      <span class="mcp-badge" id="widget-badge">Interactive</span>
    </div>
    <div id="widget-content">
      <!-- 动态正文内容 -->
    </div>
  </div>

  <script>
    function notifyHost(action, payload) {
      window.parent.postMessage({
        jsonrpc: "2.0",
        id: "action-" + Date.now(),
        method: "ui/submit",
        params: { action, payload }
      }, "*");
    }
  </script>
</body>
</html>
```
