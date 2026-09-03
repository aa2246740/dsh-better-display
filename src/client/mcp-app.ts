/**
 * Core pure functions for SEP-1865 / MCP Apps integration.
 * Free of CSS module imports so it can be cleanly tested in Node test environments.
 */

export function getHostTheme(): 'dark' | 'light' {
  if (typeof document === 'undefined') return 'light';
  if (document.body?.hasAttribute('data-ds-dark-theme')) return 'dark';
  const colorScheme = document.documentElement?.style.colorScheme;
  if (colorScheme === 'dark' || colorScheme === 'light') return colorScheme;
  const dataTheme = document.documentElement?.getAttribute('data-theme') || document.body?.getAttribute('data-theme');
  if (dataTheme === 'dark' || dataTheme === 'light') return dataTheme;
  if (document.body?.classList.contains('dark') || document.documentElement?.classList.contains('dark')) return 'dark';
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getCssTokens(theme: 'dark' | 'light'): Record<string, string> {
  const isDark = theme === 'dark';
  return {
    '--background': isDark ? '#0f172a' : '#ffffff',
    '--card': isDark ? '#1e293b' : '#f8fafc',
    '--foreground': isDark ? '#f8fafc' : '#0f172a',
    '--muted-foreground': isDark ? '#94a3b8' : '#64748b',
    '--primary': '#2563eb',
    '--primary-foreground': '#ffffff',
    '--border': isDark ? '#334155' : '#e2e8f0',
    '--hover': isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(148, 163, 184, 0.12)',
  };
}

/**
 * Extracts a title from the HTML document's <title> tag.
 */
export function extractHtmlTitle(html: string): string | undefined {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(html);
  return match?.[1]?.trim();
}

/**
 * Normalizes user/model generated HTML to ensure a valid HTML5 structure
 * and embeds a dynamic theme listener so dark/light mode switches take effect immediately.
 */
export function ensureHtmlDocument(rawHtml: string, initialTheme: 'dark' | 'light' = 'light'): string {
  const isDark = initialTheme === 'dark';
  const trimmed = rawHtml.trim();

  const themeScript = `<script>
(function() {
  function applyTheme(theme) {
    if (!theme) return;
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme;
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      if (document.body) document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      if (document.body) document.body.classList.remove('dark');
    }
  }
  applyTheme(${JSON.stringify(initialTheme)});

  // Precise content-bottom measurement to avoid scrollHeight latching to iframe outer height
  function reportHeight() {
    var body = document.body;
    if (!body) return;
    var children = body.children;
    var maxBottom = 0;
    for (var i = 0; i < children.length; i++) {
      var el = children[i];
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'LINK') continue;
      var style = window.getComputedStyle(el);
      if (style.display === 'none' || style.position === 'fixed') continue;
      var marginBottom = parseFloat(style.marginBottom) || 0;
      var bottom = el.offsetTop + el.offsetHeight + marginBottom;
      if (bottom > maxBottom) maxBottom = bottom;
    }
    var bodyStyle = window.getComputedStyle(body);
    var bodyPaddingBottom = parseFloat(bodyStyle.paddingBottom) || 0;
    var h = maxBottom > 0 ? Math.ceil(maxBottom + bodyPaddingBottom) : body.scrollHeight;
    if (h > 40) {
      window.parent.postMessage({
        jsonrpc: '2.0',
        method: 'ui/resize',
        params: { height: h }
      }, '*');
    }
  }

  if (typeof ResizeObserver !== 'undefined') {
    var ro = new ResizeObserver(function() {
      reportHeight();
    });
    if (document.body) {
      ro.observe(document.body);
    } else {
      document.addEventListener('DOMContentLoaded', function() {
        if (document.body) ro.observe(document.body);
      });
    }
  }

  window.addEventListener('load', reportHeight);
  setTimeout(reportHeight, 50);
  setTimeout(reportHeight, 250);
  setTimeout(reportHeight, 600);

  window.addEventListener('message', function(e) {
    var msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    var theme = (msg.params && msg.params.theme) || (msg.result && msg.result.hostContext && msg.result.hostContext.theme);
    if (theme) applyTheme(theme);
  });
})();
</script>`;

  if (/^<!DOCTYPE/i.test(trimmed) || /<html[\s>]/i.test(trimmed)) {
    if (/<head[\s>]/i.test(trimmed)) {
      return trimmed.replace(/<head([^>]*)>/i, `<head$1>\n  ${themeScript}`);
    }
    return trimmed;
  }
  return `<!DOCTYPE html>
<html lang="zh-CN" data-theme="${initialTheme}" class="${isDark ? 'dark' : ''}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${themeScript}
  <style>
    :root {
      --background: #ffffff;
      --card: #f8fafc;
      --border: #e2e8f0;
      --foreground: #0f172a;
      --muted-foreground: #64748b;
      --primary: #2563eb;
      --primary-foreground: #ffffff;
    }
    :root[data-theme='dark'], html.dark {
      --background: #0f172a;
      --card: #1e293b;
      --border: #334155;
      --foreground: #f8fafc;
      --muted-foreground: #94a3b8;
    }
    @media (prefers-color-scheme: dark) {
      :root:not([data-theme='light']) {
        --background: #0f172a;
        --card: #1e293b;
        --border: #334155;
        --foreground: #f8fafc;
        --muted-foreground: #94a3b8;
      }
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: transparent;
      color: var(--foreground);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 12px;
    }
  </style>
</head>
<body class="${isDark ? 'dark' : ''}">
${trimmed}
</body>
</html>`;
}

/**
 * Determines whether a markdown code block represents an MCP App.
 */
export function isMcpAppCodeBlock(lang: string | null | undefined, meta: string | null | undefined, value: string): boolean {
  const l = (lang ?? '').toLowerCase().trim();
  const m = (meta ?? '').toLowerCase().trim();
  if (l === 'mcp-app' || l === 'mcpapp' || l === 'mcp-ui' || l === 'mcp' || l.startsWith('mcp-app:') || l === 'html:mcp-app' || l === 'html:mcp') {
    return true;
  }
  if (m.includes('mcp-app') || m.includes('mcpapp') || m.includes('sep-1865') || m.includes('mcp-ui')) {
    return true;
  }
  if (l === 'html' && (value.includes('ui/submit') || value.includes('ui/initialize') || value.includes('SEP-1865') || value.includes('mcp-app'))) {
    return true;
  }
  return false;
}

/**
 * Extracts a title from code block meta or HTML content.
 */
export function extractMcpAppTitle(meta: string | null | undefined, value: string): string | undefined {
  if (meta) {
    const titleMatch = /title=["']([^"']+)["']/i.exec(meta) || /title=([^\s]+)/i.exec(meta);
    if (titleMatch?.[1]) return titleMatch[1];
  }
  const htmlTitle = extractHtmlTitle(value);
  if (htmlTitle) return htmlTitle;
  return undefined;
}

/**
 * Extracts an explicit height budget from code block meta (e.g. height=600 or height="500px").
 */
export function extractMcpAppHeight(meta: string | null | undefined): number | undefined {
  if (!meta) return undefined;
  const match = /height=["']?(\d+)(?:px)?["']?/i.exec(meta);
  if (match?.[1]) {
    const n = parseInt(match[1], 10);
    if (Number.isFinite(n) && n >= 100 && n <= 3000) return n;
  }
  return undefined;
}

/**
 * Formats a user-submitted MCP App event into a concise, natural language conversational prompt.
 * Avoids raw multiline JSON and excessive whitespace.
 */
export function formatReceiptPrompt(params: Record<string, unknown>, title?: string): string {
  // If user selected a choice/variant (e.g. quiz or blind test)
  if (typeof params.choice === 'string') {
    const desc = typeof params.desc === 'string' ? `（${params.desc}）` : '';
    const componentName = title ? `「${title}」` : '组件';
    return `我在${componentName}中选择了：${params.choice}${desc}。请根据我的选择继续。`;
  }
  if (typeof params.selectedVariant === 'string') {
    const score = typeof params.score === 'number' ? `，得分：${params.score}` : '';
    return `我在方案评测中选择了：${params.selectedVariant}${score}。请根据该方案继续分析。`;
  }
  if (typeof params.action === 'string') {
    const payloadStr = params.payload ? (typeof params.payload === 'string' ? params.payload : JSON.stringify(params.payload)) : '';
    return `[${title ?? '组件操作'}] 已完成 ${params.action}${payloadStr ? `: ${payloadStr}` : ''}`;
  }
  // Generic single field
  const keys = Object.keys(params);
  if (keys.length === 1 && typeof params[keys[0]] === 'string') {
    return `[${title ?? '组件回执'}] ${keys[0]}: ${params[keys[0]]}`;
  }
  return `[${title ?? '组件回执'}] ${JSON.stringify(params)}`;
}

/**
 * Updates a React-controlled textarea and properly notifies React's valueTracker
 * so the backdrop and input state immediately reflect the text.
 */
export function setReactInputValue(textarea: HTMLTextAreaElement, value: string): void {
  try {
    const nativeSetter = Object.getOwnPropertyDescriptor(
      window.HTMLTextAreaElement.prototype,
      'value'
    )?.set;
    if (nativeSetter) {
      nativeSetter.call(textarea, value);
    } else {
      textarea.value = value;
    }
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.focus();
  } catch {
    textarea.value = value;
  }
}
