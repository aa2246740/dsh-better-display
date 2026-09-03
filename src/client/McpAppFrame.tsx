import { memo, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getHostTheme,
  getCssTokens,
  extractHtmlTitle,
  ensureHtmlDocument,
  formatReceiptPrompt,
  setReactInputValue,
} from './mcp-app.js';
import css from './McpAppFrame.module.css';

export interface McpAppFrameProps {
  html: string;
  title?: string;
  initialHeight?: number;
}

export const McpAppFrame = memo(function McpAppFrame({
  html,
  title: initialTitle,
  initialHeight = 240,
}: McpAppFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastParamsRef = useRef<Record<string, unknown>>({});
  const [height, setHeight] = useState(() => Math.max(60, Math.min(2400, initialHeight)));
  const [ready, setReady] = useState(false);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const frameId = useId();

  const title = useMemo(() => {
    return initialTitle || extractHtmlTitle(html) || '交互式 MCP App';
  }, [initialTitle, html]);

  const [currentTheme, setCurrentTheme] = useState(getHostTheme);
  useEffect(() => {
    const update = () => setCurrentTheme(getHostTheme());
    const obs = typeof MutationObserver !== 'undefined' && typeof document !== 'undefined'
      ? new MutationObserver(update)
      : null;
    if (obs && document.body) obs.observe(document.body, { attributes: true });
    if (obs && document.documentElement) obs.observe(document.documentElement, { attributes: true });
    return () => obs?.disconnect();
  }, []);

  const preparedHtml = useMemo(() => ensureHtmlDocument(html, currentTheme), [html, currentTheme]);

  const handleUserSubmit = useCallback((params: Record<string, unknown>) => {
    lastParamsRef.current = params;
    let summary = '';
    if (typeof params.choice === 'string') {
      const desc = typeof params.desc === 'string' ? ` (${params.desc})` : '';
      summary = `选择: ${params.choice}${desc}`;
    } else if (typeof params.action === 'string') {
      summary = `操作: ${params.action}${params.payload ? ` (${JSON.stringify(params.payload)})` : ''}`;
    } else if (typeof params.selectedVariant === 'string') {
      summary = `方案: ${params.selectedVariant}`;
    } else {
      summary = JSON.stringify(params);
    }
    setReceipt(summary);

    // Populate DSH composer with natural prompt and trigger React input state
    try {
      const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
      if (textarea) {
        const prompt = formatReceiptPrompt(params, title);
        setReactInputValue(textarea, prompt);
      }
    } catch {
      // Ignore DOM query errors in non-browser environments
    }
  }, [title]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || event.source !== iframe.contentWindow) return;

      const data = event.data;
      if (!data || typeof data !== 'object') return;

      // Protocol SEP-1865 JSON-RPC 2.0
      const currentTheme = getHostTheme();
      const cssTokens = getCssTokens(currentTheme);

      // 1. ui/initialize (View -> Host)
      if (data.method === 'ui/initialize') {
        const response = {
          jsonrpc: '2.0',
          id: data.id,
          result: {
            protocolVersion: '2026-01-26',
            hostContext: {
              theme: currentTheme,
              locale: 'zh-CN',
              styles: {
                variables: cssTokens,
              },
            },
          },
        };
        iframe.contentWindow?.postMessage(response, '*');
        setReady(true);
        return;
      }

      // 2. ui/ready or initialized notification
      if (data.method === 'ui/ready' || data.method === 'ui/notifications/initialized') {
        setReady(true);
        return;
      }

      // 3. ui/resize
      if (data.method === 'ui/resize' && data.params?.height) {
        const h = Number(data.params.height);
        if (Number.isFinite(h) && h > 0) {
          setHeight(Math.max(60, Math.min(2400, Math.round(h))));
        }
        return;
      }

      // 4. ui/submit or ui/update-model-context
      if (data.method === 'ui/submit' || data.method === 'ui/update-model-context') {
        const params = (data.params as Record<string, unknown>) || {};
        handleUserSubmit(params);
        return;
      }
    };

    window.addEventListener('message', handleMessage);

    // Broadcast live theme changes to running iframe
    const broadcastTheme = () => {
      const newTheme = getHostTheme();
      const tokens = getCssTokens(newTheme);
      iframeRef.current?.contentWindow?.postMessage({
        jsonrpc: '2.0',
        method: 'ui/notifications/host-context-changed',
        params: {
          theme: newTheme,
          styles: { variables: tokens },
        },
      }, '*');
    };

    let observer: MutationObserver | null = null;
    if (typeof MutationObserver !== 'undefined' && typeof document !== 'undefined') {
      observer = new MutationObserver(broadcastTheme);
      if (document.body) {
        observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme', 'class', 'style', 'data-theme'] });
      }
      if (document.documentElement) {
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
      }
    }

    const media = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    media?.addEventListener?.('change', broadcastTheme);

    return () => {
      window.removeEventListener('message', handleMessage);
      observer?.disconnect();
      media?.removeEventListener?.('change', broadcastTheme);
    };
  }, [handleUserSubmit]);

  const handleFrameLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    // Proactive Host -> View initialize notification for boilerplate compatibility
    const currentTheme = getHostTheme();
    const cssTokens = getCssTokens(currentTheme);
    iframe.contentWindow?.postMessage({
      jsonrpc: '2.0',
      method: 'ui/initialize',
      params: {
        theme: currentTheme,
        locale: 'zh-CN',
        styles: {
          variables: cssTokens,
        },
      },
    }, '*');

    setReady(true);
  }, []);

  const handleReload = useCallback(() => {
    setReloadNonce(n => n + 1);
    setReady(false);
    setReceipt(null);
  }, []);

  return (
    <div className={css.card} data-mcp-app-card data-testid="mcp-app-card">
      <div className={css.header}>
        <div className={css.titleArea}>
          <span className={css.icon} aria-hidden="true">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M3 9h18" />
              <path d="M9 21V9" />
            </svg>
          </span>
          <span className={css.title} title={title}>{title}</span>
        </div>
        <div className={css.actions}>
          <button
            type="button"
            className={css.iconBtn}
            onClick={handleReload}
            title="重置组件状态"
            aria-label="重置组件状态"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
          </button>
        </div>
      </div>

      <div className={css.iframeWrapper} style={{ height: `${height}px` }}>
        <iframe
          key={`${frameId}-${reloadNonce}`}
          ref={iframeRef}
          className={css.iframe}
          title={title}
          srcDoc={preparedHtml}
          sandbox="allow-scripts allow-forms"
          referrerPolicy="no-referrer"
          onLoad={handleFrameLoad}
        />
      </div>

      {receipt && (
        <div className={css.receipt} data-testid="mcp-app-receipt">
          <span className={css.receiptSummary}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>已就绪：{receipt}</span>
          </span>
          <div className={css.receiptHint}>
            <button
              type="button"
              className={css.sendKbd}
              title="聚焦输入框并回车发送"
              onClick={() => {
                const textarea = document.querySelector<HTMLTextAreaElement>('textarea');
                if (textarea) {
                  const prompt = formatReceiptPrompt(lastParamsRef.current, title);
                  setReactInputValue(textarea, prompt);
                }
              }}
            >
              <span>回车直接发送</span>
              <kbd>↵</kbd>
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export function StreamingMcpAppPlaceholder({ title }: { title?: string }) {
  return (
    <div className={css.streamingPlaceholder}>
      <span className={css.pulseDot} aria-hidden="true" />
      <span>正在生成交互组件{title ? `（${title}）` : ''}...</span>
    </div>
  );
}
