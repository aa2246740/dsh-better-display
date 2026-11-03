import { jsxs as _jsxs, jsx as _jsx } from "react/jsx-runtime";
import { Component, Fragment, memo, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { JsonBlock, MarkdownText, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import { ComposerFillContext, McpAppFrame } from './McpAppFrame.js';
import { formatMessageClock } from './message-chrome.js';
import { markdownLabels, truncatedJsonLabel } from './primitive-labels.js';
import { useStreamingText } from './streaming.js';
import { MotionMarkdown, MotionPlainText } from './word-motion.js';
import { activeTextTransform, displayStreaming, originalAnswerText, readerBlockOwner, useDisplayText } from './text-transform.js';
import css from './Reader.module.css';
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
export class BlockBoundary extends Component {
    state = { failed: false, detail: '' };
    // Temporary diagnostic: surface the reason inline so a recurrence is reportable
    // without a console. Remove once the reported block crash is identified.
    static getDerivedStateFromError(error) {
        const err = error;
        return { failed: true, detail: String(err?.message ?? error).slice(0, 160) };
    }
    render() {
        return this.state.failed
            ? _jsxs("div", { className: css.notice, children: ["\u6B64\u5185\u5BB9\u6682\u65F6\u65E0\u6CD5\u5728\u9605\u8BFB\u9875\u663E\u793A\uFF1B\u539F\u5BF9\u8BDD\u4E2D\u7684\u8BB0\u5F55\u672A\u53D7\u5F71\u54CD\u3002", _jsxs("span", { "data-reader-block-error": true, style: { opacity: .65 }, children: ["\uFF08", this.state.detail, "\uFF09"] })] })
            : this.props.children;
    }
}
export const ImageBlock = memo(function ImageBlock({ attachment, loadImage }) {
    const [attempt, setAttempt] = useState(0);
    const [url, setUrl] = useState(null);
    const [error, setError] = useState(false);
    const [decoded, setDecoded] = useState(false);
    const dialog = useRef(null);
    const opener = useRef(null);
    useEffect(() => {
        let active = true;
        let owned = null;
        const timeout = setTimeout(() => { if (active) {
            setError(true);
            active = false;
        } }, 20000);
        setError(false);
        setDecoded(false);
        setUrl(null);
        void loadImage(attachment).then(result => {
            if (!active)
                return;
            clearTimeout(timeout);
            if (!IMAGE_TYPES.has(result.mediaType))
                throw new Error('Unsupported image media type');
            const bytes = Uint8Array.from(result.data);
            owned = URL.createObjectURL(new Blob([bytes.buffer], { type: result.mediaType }));
            setUrl(owned);
        }).catch(() => { clearTimeout(timeout); if (active)
            setError(true); });
        return () => { active = false; clearTimeout(timeout); if (owned)
            URL.revokeObjectURL(owned); };
    }, [attachment.attachmentId, attempt, loadImage]);
    const width = Number.isFinite(attachment.width) && attachment.width > 0 ? attachment.width : 4;
    const height = Number.isFinite(attachment.height) && attachment.height > 0 ? attachment.height : 3;
    return _jsxs("figure", { className: css.imageFigure, "data-reader-image": true, "data-image-state": error ? 'error' : decoded ? 'ready' : 'loading', children: [_jsxs("div", { className: css.imageFrame, style: { aspectRatio: `${width} / ${height}` }, children: [!error && url && _jsx("button", { ref: opener, type: "button", className: css.imageOpen, "aria-label": `放大图片${attachment.name ? `：${attachment.name}` : ''}`, onClick: () => dialog.current?.showModal(), children: _jsx("img", { src: url, alt: attachment.name ?? '会话图片', width: width, height: height, onLoad: () => setDecoded(true), onError: () => setError(true), "data-ready": decoded }) }), (!decoded || error) && _jsxs("div", { className: css.imagePlaceholder, children: [_jsx("span", { children: error ? '图片未能加载' : '正在加载图片' }), error && _jsx("button", { type: "button", className: css.textButton, onClick: () => setAttempt(value => value + 1), children: "\u91CD\u8BD5" })] })] }), attachment.name && _jsx("figcaption", { children: attachment.name }), _jsxs("dialog", { ref: dialog, className: css.imageDialog, "aria-label": "\u56FE\u7247\u9884\u89C8", onClose: () => opener.current?.focus(), onClick: event => { if (event.target === dialog.current)
                    dialog.current?.close(); }, children: [_jsx("button", { type: "button", autoFocus: true, className: css.dialogClose, "aria-label": "\u5173\u95ED\u56FE\u7247\u9884\u89C8", onClick: () => dialog.current?.close(), children: "\u00D7" }), url && _jsx("img", { src: url, alt: attachment.name ?? '会话图片' })] })] });
});
export function contentBlocks(content) {
    return content.map(block => {
        if (block.type === 'text')
            return { kind: 'text', text: block.text };
        if (block.type === 'image')
            return { kind: 'image', attachment: block.attachment };
        return { kind: 'other', block };
    });
}
function MarkdownStream({ text, streaming, holdFormatting, startedAt, interrupted = false, liveText = false, kind = 'body', fileMentions, transformed = false }) {
    const root = useRef(null);
    const presentation = useStreamingText(text, streaming, { startedAt, interrupted: interrupted || !liveText, selected: holdFormatting });
    // Native Markdown changes block keys for its full final parse. Keep the last
    // committed mode while this answer is selected, then finish formatting on
    // deselection. Business status and the source text still update normally.
    const committedMode = useRef(streaming);
    const effectiveMode = holdFormatting ? committedMode.current : presentation.formatStreaming;
    useLayoutEffect(() => { committedMode.current = effectiveMode; }, [effectiveMode]);
    return _jsx("div", { ref: root, className: css.readingText, "data-reader-text": true, "data-reader-text-kind": kind, "data-received-length": text.length, "data-shown-length": presentation.text.length, "data-presentation-pending": presentation.pending || undefined, "data-motion-style": "opacity-blur", "data-ud-motion": "reader-text-arrival", "data-ud-motion-type": "reveal", "data-ud-motion-no-flash": "true", "data-text-transform": transformed ? (streaming ? 'live' : 'final') : undefined, children: _jsx(MotionMarkdown, { text: presentation.text, streaming: effectiveMode, enabled: liveText && presentation.reveal && effectiveMode, revision: presentation.revision, fileMentions: fileMentions }) });
}
function TransformedMarkdown({ registry, blockKey, source, text, streaming, ...props }) {
    const shown = useDisplayText(registry, { text, streaming, blockKey, kind: 'body', source });
    return _jsx(MarkdownStream, { ...props, text: shown.text, streaming: displayStreaming(streaming, shown, true), transformed: true });
}
function ReadingMarkdown({ blockKey, source, ...props }) {
    const registry = activeTextTransform();
    if (registry?.has('body'))
        return _jsx(TransformedMarkdown, { registry: registry, blockKey: blockKey, source: source, ...props });
    return _jsx(MarkdownStream, { ...props });
}
function ReasoningStream({ blockKey, text, streaming, holdFormatting, startedAt, interrupted = false, liveText = false, transformed = false }) {
    const presentation = useStreamingText(text, streaming, { startedAt, interrupted: interrupted || !liveText, selected: holdFormatting });
    return _jsx("div", { className: css.readingText, "data-reader-text": true, "data-reader-text-kind": "reasoning", "data-reader-reasoning-block-key": blockKey, "data-received-length": text.length, "data-shown-length": presentation.text.length, "data-presentation-pending": presentation.pending || undefined, "data-motion-style": "opacity-blur", "data-ud-motion": "reader-text-arrival", "data-ud-motion-type": "reveal", "data-ud-motion-no-flash": "true", "data-text-transform": transformed ? (streaming ? 'live' : 'final') : undefined, children: _jsx(MotionPlainText, { text: presentation.text, enabled: liveText && presentation.reveal, revision: presentation.revision }) });
}
function TransformedReasoning({ registry, blockKey, source, text, streaming, ...props }) {
    const shown = useDisplayText(registry, { text, streaming, blockKey, kind: 'reasoning', source });
    return _jsx(ReasoningStream, { ...props, blockKey: blockKey, text: shown.text, streaming: displayStreaming(streaming, shown, true), transformed: true });
}
function ReadingReasoning({ blockKey, source, ...props }) {
    const registry = activeTextTransform();
    if (registry?.has('reasoning'))
        return _jsx(TransformedReasoning, { registry: registry, blockKey: blockKey, source: source, ...props });
    return _jsx(ReasoningStream, { ...props, blockKey: blockKey });
}
function fallback(block, streaming, source, loadImage, fillComposer, holdFormatting, presentation, blockKey, fileMentions) {
    switch (block.kind) {
        case 'text': return source === 'user' ? _jsx(MarkdownText, { text: block.text, labels: markdownLabels }) : _jsx(ReadingMarkdown, { text: block.text, streaming: streaming, holdFormatting: holdFormatting, ...presentation, fileMentions: fileMentions, blockKey: blockKey, source: source });
        case 'image': return _jsx(ImageBlock, { attachment: block.attachment, loadImage: loadImage });
        case 'reasoning': return _jsx(ReadingReasoning, { text: block.text, streaming: streaming, holdFormatting: holdFormatting, ...presentation, blockKey: blockKey, source: source });
        case 'tool-call': return _jsx(JsonBlock, { label: `工具参数 · ${block.name}`, payload: block.argsRaw, truncatedLabel: truncatedJsonLabel });
        case 'other': {
            const raw = block.block;
            if (raw && typeof raw === 'object') {
                const item = raw;
                if ((item.type === 'mcp-app' || item.type === 'mcpapp' || item.type === 'ui') && typeof item.html === 'string') {
                    return _jsx(McpAppFrame, { html: item.html, title: typeof item.title === 'string' ? item.title : undefined, fillComposer: fillComposer });
                }
            }
            return _jsxs("div", { className: css.unknown, children: [_jsx("p", { children: "\u6B64\u5185\u5BB9\u7C7B\u578B\u5C1A\u672A\u63A5\u5165\u9605\u8BFB\u9875\uFF0C\u539F\u59CB\u5185\u5BB9\u5DF2\u4FDD\u7559\u3002" }), _jsx(JsonBlock, { label: "\u67E5\u770B\u539F\u59CB\u5185\u5BB9", payload: block.block, truncatedLabel: truncatedJsonLabel })] });
        }
    }
}
export const Blocks = memo(function Blocks({ blocks, streaming = false, source = 'assistant', holdFormatting = false, startedAt, interrupted, liveText, renderSlotChain, loadImage, fillComposer, fileMentions }) {
    const reactId = useId();
    return _jsx(ComposerFillContext.Provider, { value: fillComposer, children: _jsx("div", { className: css.blocks, "data-streaming": streaming || undefined, children: blocks.map((block, index) => _jsx(BlockBoundary, { children: _jsx(Fragment, { children: renderSlotChain('dsh-better-display.block', readerBlockOwner(block, streaming, source, { startedAt, interrupted, liveText }, holdFormatting), { fallback: fallback(block, streaming, source, loadImage, fillComposer, holdFormatting, { startedAt, interrupted, liveText }, `${reactId}:${index}:${block.kind}`, fileMentions) }) }) }, block.kind === 'image' ? `image:${block.attachment.attachmentId}:${index}` : `${index}:${block.kind}`)) }) });
});
import { TurnMetrics } from './TurnMetrics.js';
function CopyGlyph() {
    return _jsxs("svg", { viewBox: "0 0 16 16", width: "16", height: "16", "aria-hidden": "true", children: [_jsx("rect", { x: "5", y: "5", width: "8", height: "8", rx: "1.5" }), _jsx("path", { d: "M3 10H2.8A.8.8 0 0 1 2 9.2V2.8a.8.8 0 0 1 .8-.8h6.4a.8.8 0 0 1 .8.8V3" })] });
}
function useCopyReceipt() {
    const [receipt, setReceipt] = useState('');
    const timer = useRef(null);
    useEffect(() => () => { if (timer.current)
        clearTimeout(timer.current); }, []);
    const copy = async (text) => {
        const accepted = await writeClipboard(text);
        setReceipt(accepted ? '已复制' : '未能复制，请手动选择文字');
        if (timer.current)
            clearTimeout(timer.current);
        timer.current = setTimeout(() => setReceipt(''), 2000);
    };
    return { receipt, copy };
}
function MessageClock({ time }) {
    return _jsx("time", { className: css.messageClock, dateTime: new Date(time).toISOString(), children: formatMessageClock(time) });
}
export function CopyAnswer({ blocks, onFork, metrics, extraActions }) {
    const { receipt, copy } = useCopyReceipt();
    // Session text. A display transformer does not write these blocks.
    const text = originalAnswerText(blocks);
    const endedAt = metrics?.endedAt;
    const hasMetrics = metrics !== undefined && (metrics.usage !== undefined || metrics.runMs !== undefined || endedAt !== undefined);
    if (!text.trim() && !onFork && !hasMetrics)
        return null;
    return _jsxs("div", { className: css.answerActions, children: [text.trim() !== '' && (_jsx("button", { type: "button", className: css.iconButton, "aria-label": "\u590D\u5236\u56DE\u7B54", title: "\u590D\u5236\u56DE\u7B54", onClick: () => { void copy(text); }, children: _jsx(CopyGlyph, {}) })), extraActions, onFork && (_jsx("button", { type: "button", className: css.iconButton, "aria-label": "\u4EE5\u6B64\u5904\u4E3A\u57FA\u7840\u521B\u5EFA\u5206\u53C9\u4F1A\u8BDD", title: "\u4EE5\u6B64\u5904\u4E3A\u57FA\u7840\u521B\u5EFA\u5206\u53C9\u4F1A\u8BDD (Fork)", onClick: onFork, children: _jsxs("svg", { viewBox: "0 0 16 16", width: "14", height: "14", fill: "none", stroke: "currentColor", strokeWidth: "1.2", children: [_jsx("circle", { cx: "4.5", cy: "3.5", r: "1.8" }), _jsx("circle", { cx: "4.5", cy: "12.5", r: "1.8" }), _jsx("circle", { cx: "11.5", cy: "5.5", r: "1.8" }), _jsx("path", { d: "M4.5 5.5v5M4.5 8c2.5 0 4.5-1 7-2.5", strokeLinecap: "round" })] }) })), metrics && _jsx(TurnMetrics, { usage: metrics.usage, runMs: metrics.runMs, tokensPerSecond: metrics.tokensPerSecond, ttftMs: metrics.ttftMs }), endedAt !== undefined && _jsx(MessageClock, { time: endedAt }), _jsx("span", { role: "status", className: css.meta, children: receipt })] });
}
export function UserMessageActions({ text, time }) {
    const { receipt, copy } = useCopyReceipt();
    const hasText = text.trim() !== '';
    if (!hasText && time === undefined)
        return null;
    return _jsxs("div", { className: css.userActions, children: [time !== undefined && _jsx(MessageClock, { time: time }), hasText && (_jsx("button", { type: "button", className: css.iconButton, "aria-label": "\u590D\u5236\u6D88\u606F", title: "\u590D\u5236\u6D88\u606F", onClick: () => { void copy(text); }, children: _jsx(CopyGlyph, {}) })), _jsx("span", { role: "status", className: css.meta, children: receipt })] });
}
//# sourceMappingURL=Blocks.js.map