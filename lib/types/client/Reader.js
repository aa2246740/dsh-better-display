import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { BlockBoundary, Blocks, contentBlocks, CopyAnswer, UserMessageActions } from './Blocks.js';
import { ReasoningCard } from './ReasoningCard.js';
import { ToolActivity, ToolMedia } from './ToolActivity.js';
import { OfficialActions, OfficialNode, OfficialTail } from './OfficialContent.js';
import { preparingLabel, readerFlow } from './tool-activity.js';
import { Disclosure, ProcessFragment, RetiringContent, StatusText, useMotionAllowed, usePinnedSelection, useReadingScroll } from './motion.js';
import { StreamMotionContext } from './streaming.js';
import { assistantSegments, boundaryOf, forkAnchorSeq, groupNodes, hasProcessContent, hasVisibleBody, isEarlierNarration, processChoiceKey, processExpanded, terminalLabel } from './projection.js';
import { basename, createProducedFileMentions, dirname, getTurnDeliverables, showDeliverablesRow } from './deliverables.js';
import { deliverableOpenModeOf } from './open-file.js';
import { asReadonlyArray, pendingSubmissionImages } from './pending-submission.js';
import { WaitingStatus } from './WaitingStatus.js';
import { handsBackToModel, waitingAnchor } from './waiting-clock.js';
import { ContextInjectionRow } from './native/ContextInjectionRow.js';
import { TimelineRail } from './TimelineRail.js';
import { landTurn, scrollerOf } from './conversation-scroll.js';
import { mergeTimelineItems } from './timeline.js';
import { presentLiveTurn, segmentLiveTurn } from './live-turn.js';
import { frostedGlassOf } from './fold-intensity.js';
import { ChoreographedFlow, useFlowChat } from './ChoreographedFlow.js';
import { ClosedProcessSummary } from './ClosedProcessSummary.js';
import { StickyLane } from './StickyLane.js';
import css from './Reader.module.css';
import { markdownLabels, truncatedJsonLabel } from './primitive-labels.js';
function isNode(node, kind) {
    return node.kind === kind;
}
function cleanErrorMessage(raw) {
    if (!raw)
        return '模型服务暂时无响应或连接中断，请稍后重试。';
    let str = raw.trim();
    if (str.includes('"error"') || str.startsWith('{')) {
        try {
            const idx = str.indexOf('{');
            const parsed = JSON.parse(str.slice(idx));
            const msg = parsed?.error?.message || parsed?.message || parsed?.error;
            if (typeof msg === 'string')
                str = msg;
        }
        catch {
            // keep
        }
    }
    return str;
}
const CompactionDivider = memo(function CompactionDivider({ data }) {
    const [open, setOpen] = useState(false);
    if (!data)
        return null;
    const hasSummary = typeof data.summary === 'string' && data.summary.trim().length > 0;
    const items = data.shadowedItemCount;
    const tokens = data.shadowedTokenCount;
    let label = '已压缩历史上下文';
    if (items && tokens) {
        const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
        label = `已压缩 ${items} 条上下文 · 释放约 ${kTokens} tokens`;
    }
    else if (items) {
        label = `已压缩 ${items} 条上下文`;
    }
    else if (tokens) {
        const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
        label = `已压缩上下文 · 释放约 ${kTokens} tokens`;
    }
    return (_jsxs("div", { className: css.compactionRow, "data-reader-compaction": true, children: [_jsx("div", { className: css.compactionLine, children: hasSummary ? (_jsxs("button", { type: "button", className: `${css.compactionPill} ${css.compactionButton}`, onClick: () => setOpen(v => !v), "aria-expanded": open, title: open ? '收起历史记忆摘要' : '展开查看此节点提炼的记忆摘要', children: [_jsxs("svg", { className: css.compactionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("path", { d: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z", strokeWidth: "1.2" }), _jsx("path", { d: "M8 5v3.2l2 1.8", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" })] }), _jsx("span", { children: label }), _jsx("span", { className: css.compactionToggle, children: open ? '收起备忘' : '查看备忘' })] })) : (_jsxs("span", { className: css.compactionPill, children: [_jsxs("svg", { className: css.compactionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("path", { d: "M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z", strokeWidth: "1.2" }), _jsx("path", { d: "M8 5v3.2l2 1.8", strokeWidth: "1.2", strokeLinecap: "round", strokeLinejoin: "round" })] }), _jsx("span", { children: label })] })) }), open && hasSummary && (_jsxs("div", { className: css.compactionSummaryBox, "data-reader-anchor": true, children: [_jsx("div", { className: css.compactionSummaryHeader, children: "\u524D\u671F\u5BF9\u8BDD\u8981\u70B9\u5907\u5FD8" }), _jsx(MarkdownText, { text: data.summary, labels: markdownLabels })] }))] }));
});
const ProcessNode = memo(function ProcessNode({ useChat, t, nodeKey, open, motion, onRead, returnFocusTo }) {
    const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
    if (!node || node.visibility === 'hidden')
        return null;
    let content = null;
    if (isNode(node, 'context'))
        content = _jsx(ContextInjectionRow, { ...node.data, t: t });
    else if (isNode(node, 'system-prompt'))
        content = _jsxs("details", { className: css.detail, children: [_jsx("summary", { children: "\u7CFB\u7EDF\u63D0\u793A\u8BCD" }), _jsx("pre", { className: css.systemPrompt, children: node.data.text })] });
    else if (isNode(node, 'model-retry'))
        content = _jsx(JsonBlock, { label: "\u6A21\u578B\u91CD\u8BD5\u8BB0\u5F55", payload: node.data.attempts, truncatedLabel: truncatedJsonLabel });
    else if (isNode(node, 'manual-compaction')) {
        if (node.data.command.outcome?.kind === 'error') {
            content = _jsxs("div", { className: css.error, role: "alert", children: [_jsxs("svg", { className: css.errorIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("circle", { cx: "8", cy: "8", r: "6.5", strokeWidth: "1.2" }), _jsx("path", { d: "M8 5v3.5M8 11.2h.01", strokeWidth: "1.5", strokeLinecap: "round" })] }), _jsxs("div", { className: css.errorCopy, children: [_jsx("div", { className: css.errorTitle, children: _jsx("strong", { children: "\u4E0A\u4E0B\u6587\u538B\u7F29\u672A\u6210\u529F" }) }), _jsx("p", { className: css.errorMessage, children: node.data.command.outcome.text })] })] });
        }
        else {
            content = node.data.compaction ? _jsx(CompactionDivider, { data: node.data.compaction }) : null;
        }
    }
    else if (isNode(node, 'compaction'))
        content = _jsx(CompactionDivider, { data: node.data });
    else if (isNode(node, 'command'))
        content = _jsx(JsonBlock, { label: "\u547D\u4EE4\u8BB0\u5F55", payload: node.data, truncatedLabel: truncatedJsonLabel });
    return content && _jsx(ProcessFragment, { open: open, motion: motion, onRead: onRead, returnFocusTo: returnFocusTo, nodeKey: nodeKey, framed: true, children: content });
});
const AssistantNode = memo(function AssistantNode({ useChat, nodeKey, boundary, processOpen = false, pinned = false, folded = false, partStart, motion, onRead, returnFocusTo, ...render }) {
    const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
    if (!node || node.visibility === 'hidden' || !isNode(node, 'assistant-step'))
        return null;
    const data = node.data;
    const parts = assistantSegments(data.blocks);
    const earlier = isEarlierNarration(data, boundary);
    const hasToolCalls = data.blocks.some(block => block.kind === 'tool-call');
    const isProcessStep = earlier || folded || hasToolCalls || (boundary.latestStep > 0 && data.step < boundary.latestStep);
    const body = data.blocks.filter(block => block.kind !== 'reasoning' && block.kind !== 'tool-call');
    const visible = partStart === undefined ? parts : parts.filter(part => part.start === partStart);
    return _jsx(_Fragment, { children: visible.map(part => {
            const index = parts.findIndex(item => item.start === part.start);
            const last = index === parts.length - 1;
            return part.kind === 'reasoning'
                ? _jsx(ProcessFragment, { open: processOpen, motion: motion, onRead: onRead, returnFocusTo: returnFocusTo, nodeKey: nodeKey, framed: true, children: _jsx(ReasoningCard, { step: data.step, active: processOpen && boundary.status === 'open' && data.step === boundary.latestStep, motion: motion, selected: pinned, onRead: onRead, children: _jsx(Blocks, { ...render, blocks: part.blocks, streaming: data.status === 'running' && last && data.blocks.at(-1)?.kind === 'reasoning', holdFormatting: pinned, startedAt: data.time, interrupted: data.status === 'interrupted', liveText: true }) }) }, part.start)
                : isProcessStep ? _jsx(ProcessFragment, { open: processOpen, motion: motion, onRead: onRead, returnFocusTo: returnFocusTo, nodeKey: nodeKey, children: _jsx("article", { className: css.processCommentary, children: _jsx(Blocks, { ...render, blocks: part.blocks, streaming: data.status === 'running', holdFormatting: pinned, startedAt: data.time, interrupted: data.status === 'interrupted', liveText: true }) }) }, part.start)
                    : hasVisibleBody(part.blocks) && _jsx(RetiringContent, { visible: pinned || processOpen || (!earlier && !folded), children: _jsxs("article", { className: css.answer, "data-reader-answer": true, "data-reader-anchor": true, "data-reader-key": nodeKey, "data-reader-source-start": part.start, "data-answer-status": data.status, "data-answer-phase": earlier || folded ? 'process' : 'body', children: [_jsx(Blocks, { ...render, blocks: part.blocks, streaming: data.status === 'running', holdFormatting: pinned, startedAt: data.time, interrupted: data.status === 'interrupted', liveText: true }), last && data.status === 'interrupted' && _jsx("span", { className: css.stopped, children: "\u5DF2\u505C\u6B62" }), last && !earlier && !folded && data.status !== 'running' && boundary.status === 'closed' && (_jsx(CopyAnswer, { blocks: body, onFork: (() => {
                                        // The fork anchor must be the durable closing message seq (same as
                                        // the official turn-tail branch). AssistantChatData carries no seq
                                        // of its own; passing it would fork the whole session instead.
                                        const anchor = forkAnchorSeq([data.finalNode, { seq: render.forkSeq }]);
                                        return render.forkAt && anchor !== undefined ? () => render.forkAt(anchor) : undefined;
                                    })(), metrics: render.metrics, extraActions: _jsx(OfficialActions, { official: render.official, messageId: data.finalNode?.messageId }) }))] }) }, part.start);
        }) });
});
const MainNode = memo(function MainNode({ useChat, nodeKey, boundary, pinned, processOpen = false, ...render }) {
    const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
    if (!node || node.visibility === 'hidden')
        return null;
    if (isNode(node, 'user') || isNode(node, 'steering')) {
        const blocks = contentBlocks(node.data.content);
        const imageBlocks = blocks.filter(b => b.kind === 'image');
        const otherBlocks = blocks.filter(b => b.kind !== 'image');
        const text = otherBlocks.filter((block) => block.kind === 'text').map(block => block.text).join('\n\n');
        const time = node.data.time;
        return _jsxs("div", { className: css.userCluster, "data-reader-anchor": true, "data-reader-key": nodeKey, children: [node.kind === 'steering' && _jsx("p", { className: css.meta, children: "\u8865\u5145\u6D88\u606F" }), imageBlocks.length > 0 && _jsx("div", { className: css.userImages, children: _jsx(Blocks, { ...render, blocks: imageBlocks, source: "user" }) }), otherBlocks.length > 0 && _jsx("div", { className: css.user, children: _jsx(Blocks, { ...render, blocks: otherBlocks, source: "user" }) }), _jsx(UserMessageActions, { text: text, time: time })] });
    }
    if (isNode(node, 'assistant-step'))
        return null;
    if (isNode(node, 'tool-call'))
        return _jsx(ToolMedia, { ...render, block: node.data.root });
    if (isNode(node, 'turn-error'))
        return _jsxs("div", { className: css.error, role: "alert", "data-reader-anchor": true, children: [_jsxs("svg", { className: css.errorIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("circle", { cx: "8", cy: "8", r: "6.5", strokeWidth: "1.2" }), _jsx("path", { d: "M8 5v3.5M8 11.2h.01", strokeWidth: "1.5", strokeLinecap: "round" })] }), _jsxs("div", { className: css.errorCopy, children: [_jsxs("div", { className: css.errorTitle, children: [_jsx("strong", { children: "\u672C\u8F6E\u8FD0\u884C\u5931\u8D25" }), node.data.code && _jsx("code", { className: css.errorCode, children: node.data.code })] }), _jsx("p", { className: css.errorMessage, children: cleanErrorMessage(node.data.message) })] })] });
    if (isNode(node, 'turn-max-tokens'))
        return _jsx("div", { className: css.notice, children: "\u5DF2\u5230\u8FBE\u8F93\u51FA\u957F\u5EA6\u9650\u5236\uFF0C\u56DE\u7B54\u5C1A\u672A\u5B8C\u6574\u3002" });
    if (isNode(node, 'model-retry'))
        return node.data.current.retryState === 'scheduled'
            ? _jsx("div", { className: css.notice, role: "status", children: "\u6A21\u578B\u8BF7\u6C42\u672A\u6210\u529F\uFF0C\u6B63\u5728\u7B49\u5F85\u91CD\u8BD5\u3002\u8BE6\u60C5\u4FDD\u7559\u5728\u6267\u884C\u8FC7\u7A0B\u4E2D\u3002" }) : null;
    if (isNode(node, 'command') && render.official)
        return _jsx(OfficialNode, { ...render, node: node, fallback: _jsx(JsonBlock, { label: "\u547D\u4EE4\u8BB0\u5F55", payload: node.data, truncatedLabel: truncatedJsonLabel }) });
    if (isNode(node, 'command')) {
        if (node.data.outcome?.kind === 'error')
            return _jsxs("div", { className: css.error, role: "alert", children: [_jsxs("svg", { className: css.errorIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("circle", { cx: "8", cy: "8", r: "6.5", strokeWidth: "1.2" }), _jsx("path", { d: "M8 5v3.5M8 11.2h.01", strokeWidth: "1.5", strokeLinecap: "round" })] }), _jsxs("div", { className: css.errorCopy, children: [_jsx("div", { className: css.errorTitle, children: _jsx("strong", { children: "\u547D\u4EE4\u6267\u884C\u672A\u6210\u529F" }) }), _jsx("p", { className: css.errorMessage, children: node.data.outcome.text ?? node.data.name ?? '查看原对话中的命令记录' })] })] });
        return node.data.outcome?.text ? _jsx(MarkdownText, { text: node.data.outcome.text, labels: markdownLabels }) : null;
    }
    if (isNode(node, 'manual-compaction') || isNode(node, 'compaction'))
        return null;
    if (node.kind === 'context' || node.kind === 'turn-tail' || node.kind === 'system-prompt' || node.kind === 'turn-process')
        return null;
    // No 'command-input' branch: that string is not a chat node kind in any released
    // host (it appears nowhere in the installed packages), so a slash command arrives
    // as 'command' above and is rendered there. Keeping the branch only made the file
    // look like it handled a case that cannot occur.
    return _jsx(OfficialNode, { ...render, node: node, fallback: _jsxs("div", { className: css.unknown, "data-reader-anchor": true, children: [_jsxs("p", { children: ["\u6B64\u8BB0\u5F55\u7C7B\u578B\u6682\u672A\u63A5\u5165\u9605\u8BFB\u9875\uFF1A", node.kind] }), render.official && _jsx("button", { type: "button", className: css.textButton, onClick: () => render.official.openView('chat', node.key), children: "\u5728\u5BF9\u8BDD\u4E2D\u67E5\u770B" }), _jsx(JsonBlock, { label: "\u67E5\u770B\u539F\u59CB\u8BB0\u5F55", payload: node.data, truncatedLabel: truncatedJsonLabel })] }) });
});
/**
 * Sub-agents this turn dispatched, read from the host's own Turn-process row.
 *
 * The host already derives this from the dispatch tree (`subagentCount` on
 * `TurnProcessChatData`), so counting calls here would only risk disagreeing with
 * it. The row is otherwise hidden by the reader, which is why this is the one place
 * its counters are read.
 */
function subagentCount(snapshot, keys) {
    for (const key of keys) {
        const node = snapshot.nodes.get(key);
        if (!node || node.kind !== 'turn-process')
            continue;
        const value = node.data.subagentCount;
        if (typeof value === 'number' && Number.isFinite(value) && value > 0)
            return value;
    }
    return 0;
}
function GroupStatus({ group, sessionId, useChat, pending, motion }) {
    const text = useChat(snapshot => {
        const turn = group.turn === null ? undefined : snapshot.timeline.turns.get(group.turn);
        if (turn?.status === 'closed') {
            if (turn.end?.data.reason.kind !== 'completed')
                return '执行过程';
            const elapsed = turn.start && turn.end ? Math.max(0, Math.round((turn.end.time - turn.start.time) / 1000)) : null;
            return elapsed === null ? '执行过程' : elapsed < 60 ? `用时 ${elapsed} 秒` : `用时 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
        }
        if (turn?.status !== 'open')
            return '执行过程';
        if (pending !== undefined)
            return '等待你的操作';
        const current = turn.steps.at(-1)?.data.get('assistant-step');
        const last = current?.blocks.at(-1);
        if (current?.status === 'running' && last?.kind === 'tool-call') {
            const spawned = subagentCount(snapshot, group.keys);
            return spawned ? `${preparingLabel(last.name)}·${spawned} 个子代理` : preparingLabel(last.name);
        }
        for (let index = group.keys.length - 1; index >= 0; index--) {
            const node = snapshot.nodes.get(group.keys[index]);
            if (!node)
                continue;
            if (isNode(node, 'tool-call') && !('kind' in node.data.root))
                return '正在使用工具';
            if (isNode(node, 'assistant-step') && node.data.status === 'running') {
                const last = node.data.blocks.at(-1);
                return last?.kind === 'reasoning' ? '正在思考' : last?.kind === 'text' ? '正在输出' : '正在准备回复';
            }
        }
        return '正在处理';
    });
    const busy = useChat(snapshot => group.turn !== null && snapshot.timeline.turns.get(group.turn)?.status === 'open' && pending === undefined);
    return _jsx(StatusText, { text: text, motion: motion, shimmer: busy });
}
const DeliverableChip = memo(function DeliverableChip({ path, openFile, revealFile, openMode }) {
    const [status, setStatus] = useState('idle');
    const timer = useRef();
    const flash = (next) => {
        setStatus(next);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setStatus('idle'), 1600);
    };
    const onOpen = (event) => {
        event.stopPropagation();
        try {
            openFile?.(path);
            flash('opened');
        }
        catch {
            // fallback
        }
    };
    const onReveal = (event) => {
        event.stopPropagation();
        try {
            if (revealFile) {
                revealFile(path);
            }
            else {
                openFile?.(dirname(path));
            }
            flash('revealed');
        }
        catch {
            // fallback
        }
    };
    const onCopy = (event) => {
        event.stopPropagation();
        try {
            void navigator.clipboard?.writeText(path);
            flash('copied');
        }
        catch {
            // fallback
        }
    };
    const name = basename(path);
    const folder = dirname(path);
    return (_jsxs("div", { className: css.deliverableChip, "data-status": status, title: path, children: [_jsxs("button", { type: "button", className: css.chipMain, onClick: onOpen, onDoubleClick: onOpen, "aria-label": openMode === 'sidebar' ? `在内置面板中打开 ${path}` : `用系统应用打开 ${path}`, children: [status === 'opened' ? (_jsx("svg", { className: css.statusIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: _jsx("path", { d: "M3.5 8.5l3 3 6-7", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) })) : (_jsxs("svg", { className: css.deliverableIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("path", { d: "M4 2.5h5l3 3V13.5H4V2.5z", strokeWidth: "1.2", strokeLinejoin: "round" }), _jsx("path", { d: "M9 2.5v3h3", strokeWidth: "1.2", strokeLinejoin: "round" })] })), _jsx("span", { className: css.deliverableName, children: status === 'opened' ? (openMode === 'sidebar' ? '已在面板打开' : '已在外部打开') : name })] }), _jsxs("div", { className: css.chipActions, "aria-label": "\u6587\u4EF6\u64CD\u4F5C", children: [_jsx("button", { type: "button", className: css.chipActionBtn, title: `在访达中定位所在目录 (${folder})`, "aria-label": "\u5728\u8BBF\u8FBE\u4E2D\u663E\u793A\u6240\u5728\u76EE\u5F55", onClick: onReveal, children: status === 'revealed' ? (_jsx("svg", { className: css.actionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: _jsx("path", { d: "M3.5 8.5l3 3 6-7", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) })) : (_jsx("svg", { className: css.actionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: _jsx("path", { d: "M2 4.5h4l1.5 2H14v6.5H2V4.5z", strokeWidth: "1.2", strokeLinejoin: "round" }) })) }), _jsx("button", { type: "button", className: css.chipActionBtn, title: "\u590D\u5236\u76F8\u5BF9\u8DEF\u5F84", "aria-label": "\u590D\u5236\u76F8\u5BF9\u8DEF\u5F84", onClick: onCopy, children: status === 'copied' ? (_jsx("svg", { className: css.actionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: _jsx("path", { d: "M3.5 8.5l3 3 6-7", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) })) : (_jsxs("svg", { className: css.actionIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: [_jsx("rect", { x: "5.5", y: "5.5", width: "8", height: "8", rx: "1.5", strokeWidth: "1.2" }), _jsx("path", { d: "M4 10.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1", strokeWidth: "1.2", strokeLinecap: "round" })] })) })] })] }));
});
function DeliverablesRow({ deliverables, openFile, revealFile, openMode }) {
    const [folderStatus, setFolderStatus] = useState('idle');
    const onOpenWorkspace = () => {
        try {
            openFile?.('.');
            setFolderStatus('opened');
            setTimeout(() => setFolderStatus('idle'), 1600);
        }
        catch {
            // ignore
        }
    };
    return (_jsxs("div", { className: css.deliverablesRoot, "data-reader-deliverables": true, children: [_jsx("span", { className: css.deliverablesLabel, children: "\u4EA7\u7269" }), _jsx("div", { className: css.deliverablesLane, children: _jsxs("div", { className: css.deliverablesRow, children: [deliverables.slice(0, 8).map(path => (_jsx(DeliverableChip, { path: path, openFile: openFile, revealFile: revealFile, openMode: openMode }, path))), deliverables.length > 8 && (_jsxs("span", { className: css.deliverablesMore, children: ["+ ", deliverables.length - 8, " \u4E2A\u6587\u4EF6"] })), deliverables.length > 1 && (_jsxs("button", { type: "button", className: css.deliverablesShowFolder, "data-status": folderStatus, onClick: onOpenWorkspace, title: "\u5728\u8BBF\u8FBE\u4E2D\u6253\u5F00\u6574\u4E2A\u5DE5\u4F5C\u533A\u76EE\u5F55", children: [folderStatus === 'opened' && (_jsx("svg", { className: css.statusIcon, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", children: _jsx("path", { d: "M3.5 8.5l3 3 6-7", strokeWidth: "1.8", strokeLinecap: "round", strokeLinejoin: "round" }) })), _jsx("span", { children: folderStatus === 'opened' ? '已打开访达' : '在文件夹中显示' })] }))] }) })] }));
}
const TurnGroup = memo(function TurnGroup({ group, motion, autoFold, pinnedKeys, selectedProcessKeys, isAwaitingModel = false, ...props }) {
    const snapshot = props.useChat(snapshot => snapshot);
    const nodes = snapshot.nodes;
    const turn = group.turn === null ? undefined : snapshot.timeline.turns.get(group.turn);
    const interaction = props.useSessionStatus(snapshot => snapshot.get(props.sessionId)?.pendingInteraction);
    const sessionRunning = props.useSession(snapshot => snapshot.running);
    const boundary = useMemo(() => boundaryOf(turn), [turn]);
    const choiceKey = processChoiceKey(group.key, boundary);
    const expansionChoice = props.useStore(state => state.expanded[choiceKey]);
    const flowId = useId();
    const processButton = useRef(null);
    const setExpanded = useCallback((value) => props.actions.setExpanded(choiceKey, value), [props.actions, choiceKey]);
    const pinProcess = useCallback(() => setExpanded(true), [setExpanded]);
    const firstKind = props.useChat(snapshot => snapshot.nodes.get(group.keys[0])?.kind);
    const startsWithUser = firstKind === 'user';
    const mainKeys = startsWithUser ? group.keys.slice(1) : group.keys;
    const flow = useMemo(() => readerFlow({ ...group, keys: mainKeys }, turn, key => nodes.get(key)), [nodes, group, mainKeys, turn]);
    const steps = useMemo(() => segmentLiveTurn(flow, key => nodes.get(key)), [flow, nodes]);
    const liveItems = useMemo(() => presentLiveTurn(steps, boundary, autoFold), [steps, boundary, autoFold]);
    const openMode = deliverableOpenModeOf(useSyncExternalStore(props.openPrefs?.subscribe ?? ((fn) => { void fn; return () => { }; }), () => props.openPrefs?.getSnapshot()?.deliverableOpenMode, () => 'external'));
    const hasProcess = flow.some(item => item.kind === 'tool' || hasProcessContent(nodes.get(item.nodeKey), boundary));
    // Only a real, still-active text selection delays folding. Merely clicking,
    // focusing or scrolling the live card does not create a permanent override.
    const holdingSelection = selectedProcessKeys.some(key => flow.some(item => item.key === key)
        || liveItems.some(item => item.kind === 'fold'
            ? item.key === key || item.steps.some(step => step.key === key || ('nodeKey' in step && step.nodeKey === key))
            : item.key === key || ('nodeKey' in item.step && item.step.nodeKey === key)));
    const expanded = !autoFold || holdingSelection || processExpanded(expansionChoice, boundary);
    const [foldOpenByKey, setFoldOpenByKey] = useState({});
    useLayoutEffect(() => {
        // Restoring automatic folding also releases live "prior steps" disclosures.
        if (autoFold)
            setFoldOpenByKey(current => Object.keys(current).length ? {} : current);
    }, [autoFold]);
    const deliverables = useMemo(() => getTurnDeliverables(turn, flow), [turn, flow]);
    const tailData = useMemo(() => {
        for (const key of group.keys) {
            const n = nodes.get(key);
            if (n && isNode(n, 'turn-tail'))
                return n.data;
        }
        return undefined;
    }, [group.keys, nodes]);
    const tailOwner = useMemo(() => turn && tailData ? {
        turn, seq: tailData.closing?.finalNode.seq ?? tailData.seq, openFile: props.openFile,
    } : undefined, [turn, tailData, props.openFile]);
    const fileMentions = useMemo(() => {
        const official = tailOwner ? props.officialFileMentions(tailOwner) : undefined;
        const reader = deliverables.length > 0 ? createProducedFileMentions(deliverables, props.openFile) : undefined;
        return official || reader ? { resolve: (value) => official?.resolve(value) ?? reader?.resolve(value) } : undefined;
    }, [tailOwner, props.officialFileMentions, deliverables, props.openFile]);
    const official = useMemo(() => ({
        renderSlot: props.renderSlot, renderSlotChain: props.renderSlotChain,
        officialImageLoader: props.officialImageLoader, officialFileMentions: props.officialFileMentions,
        officialPreviewFile: props.officialPreviewFile,
        officialHost: props.officialHost, openView: props.openView,
    }), [props.renderSlot, props.renderSlotChain, props.officialImageLoader, props.officialFileMentions, props.officialPreviewFile, props.officialHost, props.openView]);
    const cwd = props.useSessions(state => state.byId[props.sessionId]?.cwd);
    const runMs = turn?.start && turn?.end ? Math.max(0, turn.end.time - turn.start.time) : undefined;
    const metrics = useMemo(() => ({
        usage: tailData?.tokenUsage,
        runMs,
        tokensPerSecond: tailData?.tokensPerSecond,
        ttftMs: tailData?.ttftMs,
        endedAt: tailData?.closing?.time ?? turn?.end?.time,
    }), [tailData, runMs, turn?.end?.time]);
    const forkSeq = forkAnchorSeq([tailData?.closing?.finalNode]);
    const presentation = useMemo(() => {
        // ChatNodeStore exposes live keyed readers. Materialize this turn instead of
        // retaining a live get() function and mistakenly calling it a frozen frame.
        const captured = new Map(group.keys.flatMap(key => {
            const node = nodes.get(key);
            return node ? [[key, node]] : [];
        }));
        return { items: holdingSelection ? presentLiveTurn(steps, boundary, false) : liveItems,
            snapshot: { ...snapshot, nodes: { ...nodes, get: (key) => captured.get(key), values: () => [...captured.values()] } } };
    }, [snapshot, nodes, group, steps, boundary, liveItems, holdingSelection]);
    const shared = {
        useChat: useFlowChat,
        renderSlotChain: props.renderSlotChain,
        loadImage: props.loadImage,
        fillComposer: props.fillComposer,
        openFile: props.openFile,
        revealFile: props.revealFile,
        forkAt: props.forkAt,
        forkSeq,
        fileMentions,
        metrics,
        official,
        cwd,
    };
    const terminal = terminalLabel(boundary.reason);
    const hasTurnError = flow.some(item => item.kind === 'node' && nodes.get(item.nodeKey)?.kind === 'turn-error');
    // A stopped turn normally stays quiet, but a stopped turn that produced no
    // prose at all reads as if its answer vanished into the process fold. Say so.
    const hasAnswerProse = steps.some(step => step.kind === 'body'
        && step.blocks.some(block => block.kind === 'text' && block.text.trim() !== ''));
    const stoppedWithoutAnswer = (boundary.reason === 'interrupted' || boundary.reason === 'aborted') && !hasAnswerProse;
    const showTerminalNotice = terminal && !hasTurnError
        && (stoppedWithoutAnswer || (boundary.reason !== 'interrupted' && boundary.reason !== 'aborted'));
    const renderStep = (step, folded) => {
        const processOpen = folded || expanded;
        if (step.kind === 'reasoning' || step.kind === 'body')
            return _jsx(BlockBoundary, { children: _jsx(AssistantNode, { ...shared, boundary: boundary, nodeKey: step.nodeKey, partStart: step.start, pinned: pinnedKeys.includes(step.nodeKey), processOpen: processOpen, folded: folded, motion: motion, onRead: pinProcess, returnFocusTo: processButton }) });
        if (step.kind === 'tool')
            return _jsx(BlockBoundary, { children: _jsxs(ProcessFragment, { open: processOpen, motion: motion, onRead: pinProcess, returnFocusTo: processButton, nodeKey: step.key, framed: true, children: [_jsx(ToolActivity, { ...shared, entry: step.entry, motion: motion, turnClosed: boundary.status === 'closed', onRead: pinProcess }), step.entry.block && _jsx(ToolMedia, { ...shared, block: step.entry.block })] }) });
        if (step.kind === 'user')
            return _jsx(BlockBoundary, { children: _jsx(MainNode, { ...shared, boundary: boundary, nodeKey: step.nodeKey }) });
        return _jsxs(Fragment, { children: [_jsx(BlockBoundary, { children: _jsx(ProcessNode, { useChat: useFlowChat, t: props.t, nodeKey: step.nodeKey, open: processOpen, motion: motion, onRead: pinProcess, returnFocusTo: processButton }) }), _jsx(BlockBoundary, { children: _jsx(MainNode, { ...shared, boundary: boundary, nodeKey: step.nodeKey, pinned: pinnedKeys.includes(step.nodeKey), processOpen: processOpen }) })] });
    };
    return _jsxs("section", { className: css.turn, "data-reader-turn": group.turn ?? 'unresolved', "data-reader-turn-state": boundary.status, "data-reader-turn-result": boundary.reason ?? undefined, children: [startsWithUser && _jsx(BlockBoundary, { children: _jsx(MainNode, { ...shared, useChat: props.useChat, boundary: boundary, nodeKey: group.keys[0] }) }), hasProcess && !isAwaitingModel && _jsx(StickyLane, { kind: "status", className: css.turnProcessSticky, children: _jsx(Disclosure, { open: expanded, onChange: setExpanded, controls: flowId, buttonRef: processButton, label: _jsx(GroupStatus, { group: group, sessionId: props.sessionId, useChat: props.useChat, pending: interaction, motion: motion }) }) }), boundary.status === 'closed' && hasProcess && autoFold && _jsx(ClosedProcessSummary, { open: expanded, onChange: setExpanded, controls: flowId, steps: steps.filter(step => {
                    if (step.kind === 'user')
                        return false;
                    if (step.kind !== 'body')
                        return true;
                    const node = nodes.get(step.nodeKey);
                    return !!node && isNode(node, 'assistant-step') && (isEarlierNarration(node.data, boundary)
                        || node.data.blocks.some(block => block.kind === 'tool-call')
                        || (boundary.latestStep > 0 && node.data.step < boundary.latestStep));
                }) }), _jsx(ChoreographedFlow, { id: flowId, frame: presentation, motion: motion, enabled: autoFold && boundary.status === 'open' && !holdingSelection, urgent: hasTurnError || interaction !== undefined || !sessionRunning, open: foldOpenByKey, processOpen: expanded, onOpenChange: (key, value) => { pinProcess(); setFoldOpenByKey(current => ({ ...current, [key]: value })); }, renderStep: renderStep }), !hasProcess && boundary.status === 'open' && !isAwaitingModel && _jsx("div", { className: css.disclosure, "data-reader-status-only": true, children: _jsx(GroupStatus, { group: group, sessionId: props.sessionId, useChat: props.useChat, pending: interaction, motion: motion }) }), showDeliverablesRow(boundary.status, deliverables) && _jsx(DeliverablesRow, { deliverables: deliverables, openFile: props.openFile, revealFile: props.revealFile, openMode: openMode }), boundary.status === 'closed' && _jsx(BlockBoundary, { children: _jsx(OfficialTail, { official: official, owner: tailOwner, produced: deliverables }) }), showTerminalNotice && _jsx("div", { className: css.notice, "data-reader-terminal": true, children: terminal })] });
});
export function Reader(props) {
    const root = useRef(null);
    const activatedAt = useRef(Date.now());
    const order = props.useChat(snapshot => snapshot.order);
    const nodes = props.useChat(snapshot => snapshot.nodes);
    const timeline = props.useChat(snapshot => snapshot.timeline);
    const running = props.useSession(snapshot => snapshot.running);
    const pending = props.useSessionStatus(snapshot => snapshot.get(props.sessionId)?.pendingInteraction);
    const openError = props.useSession(snapshot => snapshot.openError);
    const loading = props.useSession(snapshot => snapshot.openState === 'loading');
    const hasMore = props.useSession(snapshot => snapshot.hasMore);
    const loadingOlder = props.useSession(snapshot => snapshot.loadingOlder);
    const pendingSubmissions = props.useSession(snapshot => snapshot.pendingSubmissions);
    const pendingList = asReadonlyArray(pendingSubmissions);
    const waitAnchor = waitingAnchor(order, key => nodes.get(key), pendingList);
    const motionPreference = props.useStore(state => state.motion);
    const motion = useMotionAllowed(motionPreference);
    const prefsSnap = useSyncExternalStore(props.openPrefs?.subscribe ?? ((fn) => { void fn; return () => { }; }), () => props.openPrefs?.getSnapshot?.(), () => undefined);
    const storeAutoFold = props.useStore(state => state.autoFold);
    const autoFold = prefsSnap?.autoFold ?? (prefsSnap?.foldIntensity !== undefined ? prefsSnap.foldIntensity !== 0 : undefined) ?? storeAutoFold ?? true;
    const previousAutoFold = useRef(autoFold);
    useLayoutEffect(() => {
        const restored = autoFold && !previousAutoFold.current;
        previousAutoFold.current = autoFold;
        // Watch the effective preference so toolbar and Settings changes behave alike.
        // Reading while folding is off must not pin completed process content forever.
        if (restored)
            props.actions.resetExpanded();
    }, [autoFold, props.actions]);
    const frostedGlass = frostedGlassOf(prefsSnap);
    const streamMotion = useMemo(() => ({ enabled: motion, activatedAt: activatedAt.current }), [motion]);
    const groups = useMemo(() => groupNodes(order, key => nodes.get(key)), [order, nodes, timeline]);
    const isAwaitingModel = useMemo(() => {
        // 状态机铁律：「深度求索中」与「正在处理/思考」永远互斥。
        // 1. 仅空闲发送（!running）的本地回显窗口：用户按下回车第 0 毫秒立即反馈。
        //    忙碌时的 queued/steering 回显不算等待——模型本来就在工作。
        if (!running && pendingList.length > 0)
            return true;
        const lastKey = order.at(-1);
        const lastNode = lastKey ? nodes.get(lastKey) : undefined;
        if (!lastKey || !lastNode)
            return false;
        // 2. 模型已经产出内容：等待结束，计时器必须立刻消失。
        //    「产出」= assistant-step 已带 block（正文/思维链/工具调用都算）。
        if (lastNode.kind === 'assistant-step') {
            const data = lastNode.data;
            const blocks = data.blocks ?? [];
            // 空 block 且仍在跑 = 请求已发出、模型还没吐字，正是要计时的那一刻。
            return blocks.length === 0 && data.status === 'running';
        }
        // 3. 球在模型脚下：用户刚发言，或工具已返回、上下文已注入、命令已执行。
        //    这些时刻模型随时可能卡住，正是要计时的地方；工具执行期间不计时，
        //    因为那时忙的是工具而不是模型。
        //    handsBackToModel 内部按 chat 层 kind 判定，并区分「工具已返回」与
        //    「工具仍在跑」——后者不算等待。
        const modelOwesResponse = handsBackToModel(lastNode);
        if (!modelOwesResponse)
            return false;
        // 轮次已结束就没什么可等的。
        const lastGroup = groups.at(-1);
        const turn = lastGroup?.turn === null || lastGroup?.turn === undefined ? undefined : timeline.turns.get(lastGroup.turn);
        return turn?.status !== 'closed';
    }, [running, pendingList, order, nodes, groups, timeline]);
    const scroll = useReadingScroll(root, motion);
    const pinnedKeys = usePinnedSelection(root);
    const selectedProcessKeys = usePinnedSelection(root, '[data-reader-process]');
    const [historyError, setHistoryError] = useState(false);
    // 1. Navigation items from Chat snapshot
    const turnNavigationItems = props.useChat(snapshot => snapshot.navigation?.items ? snapshot.navigation.items() : undefined);
    // 2. Whole-log turn outline projection
    const turnOutline = props.useProjection?.('turnOutline');
    // 3. Track turns with deliverables
    const turnsWithDeliverables = useMemo(() => {
        const set = new Set();
        for (const [turnNum, loc] of timeline.turns) {
            const deliv = loc.data?.get('deliverables');
            if (Array.isArray(deliv?.produced) && deliv.produced.length > 0) {
                set.add(turnNum);
            }
        }
        return set;
    }, [timeline]);
    // 4. Merged timeline items for the rail
    const timelineItems = useMemo(() => mergeTimelineItems(turnNavigationItems, turnOutline, turnsWithDeliverables), [turnNavigationItems, turnOutline, turnsWithDeliverables]);
    // 5. Active & busy turn tracking
    const [activeTurn, setActiveTurn] = useState(null);
    const [busyTurn, setBusyTurn] = useState(null);
    // Scroll spy to update activeTurn
    useEffect(() => {
        const el = root.current;
        if (!el)
            return;
        const scroller = el.closest('[data-conversation-scroll]') ?? el;
        let ticking = false;
        const updateActive = () => {
            if (ticking)
                return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const line = (scroller instanceof HTMLElement ? scroller.clientHeight : window.innerHeight) * 0.35;
                const turnRows = el.querySelectorAll('[data-reader-turn]:not([data-reader-turn="unresolved"])');
                let current = null;
                for (const row of turnRows) {
                    const rect = row.getBoundingClientRect();
                    if (rect.top <= line) {
                        const num = Number(row.dataset.readerTurn);
                        if (Number.isSafeInteger(num))
                            current = num;
                    }
                    else {
                        break;
                    }
                }
                if (current !== null) {
                    setActiveTurn(current);
                }
                else if (turnRows.length > 0) {
                    const first = Number(turnRows[0].dataset.readerTurn);
                    if (Number.isSafeInteger(first))
                        setActiveTurn(first);
                }
            });
        };
        scroller.addEventListener('scroll', updateActive, { passive: true });
        updateActive();
        return () => scroller.removeEventListener('scroll', updateActive);
    }, [groups]);
    // Navigation handler (supports loaded jump & unloaded loadThrough).
    // Land on the conversation scroller only — scrollIntoView also moves
    // ancestor boxes and can lift the sticky composer after a top→bottom jump.
    const onNavigateTurn = useCallback(async (item) => {
        const el = root.current;
        if (!el)
            return;
        const port = scrollerOf(el);
        const reveal = (turn) => {
            const targetRow = el.querySelector(`[data-reader-turn="${turn}"]`);
            if (!targetRow)
                return;
            const last = timelineItems.at(-1);
            if (last !== undefined && last.turn === turn) {
                scroll.jump();
            }
            else {
                scroll.release();
                landTurn(targetRow, port);
            }
            setActiveTurn(turn);
        };
        if (item.anchor.kind === 'loaded') {
            reveal(item.turn);
            return;
        }
        setBusyTurn(item.turn);
        try {
            if (props.loadThrough) {
                await props.loadThrough(item.anchor.seq);
            }
            else {
                await props.loadOlder();
            }
            setTimeout(() => { reveal(item.turn); }, 50);
        }
        finally {
            setBusyTurn(null);
        }
    }, [props.loadThrough, props.loadOlder, scroll.jump, scroll.release, timelineItems]);
    const lastKey = order.at(-1);
    const lastNode = lastKey ? nodes.get(lastKey) : undefined;
    const lastSubmissionId = pendingList.length ? pendingList[pendingList.length - 1].requestId : null;
    const lastOrderKeyRef = useRef(lastKey);
    const lastSubmissionRef = useRef(lastSubmissionId);
    useLayoutEffect(() => {
        const appendedUser = lastKey !== lastOrderKeyRef.current && (lastNode?.kind === 'user' || lastNode?.kind === 'steering');
        const appendedSubmission = lastSubmissionId !== null && lastSubmissionId !== lastSubmissionRef.current;
        lastOrderKeyRef.current = lastKey;
        lastSubmissionRef.current = lastSubmissionId;
        if (appendedUser || appendedSubmission) {
            scroll.jump();
        }
    }, [lastKey, lastNode?.kind, lastSubmissionId, scroll]);
    const visibleSubmissions = useMemo(() => {
        if (pendingList.length === 0)
            return [];
        return pendingList.filter(sub => sub.placement !== 'queued');
    }, [pendingList]);
    // ChatView publishes data-chat-flow="" on its column. Skins treat a
    // scrollport without that hook as inspect-only and hide [data-composer-seat].
    return _jsx(StreamMotionContext.Provider, { value: streamMotion, children: _jsxs("div", { ref: root, className: css.root, "data-reader-build": "0.3.3", "data-dsh-better-display": "0.3.3", "data-reader-wait-clock-version": "input-v1", "data-reader-wait-start": waitAnchor.time ?? undefined, "data-motion": motion ? 'on' : 'off', "data-reader-glass": frostedGlass || undefined, "data-reader-auto-fold": autoFold ? 'on' : 'off', children: [_jsx(TimelineRail, { items: timelineItems, activeTurn: activeTurn, busyTurn: busyTurn, onNavigate: onNavigateTurn }), _jsxs("div", { className: css.column, "data-chat-flow": "", children: [_jsx(StickyLane, { kind: "toolbar", className: css.toolbar, children: _jsx("button", { type: "button", className: css.textButton, "aria-pressed": autoFold, onClick: () => {
                                    props.actions.setAutoFold(!autoFold);
                                    props.openPrefs?.actions?.setAutoFold?.(!autoFold);
                                }, title: "\u65B0\u601D\u8003\u4EA7\u751F\u65F6\uFF0C\u662F\u5426\u81EA\u52A8\u5C06\u6B64\u524D\u6B65\u9AA4\u6536\u62E2\u4E3A\u4E00\u884C\u6C47\u603B\u3002\u5173\u95ED\u540E\u5B8C\u6574\u4FDD\u7559\u539F\u59CB\u8FC7\u7A0B\u4E0E\u6D41\u5F0F\u8F93\u51FA\u3002", children: `自动折叠${autoFold ? '开' : '关'}` }) }), hasMore && _jsx("button", { type: "button", className: css.historyButton, disabled: loadingOlder, onClick: async () => {
                                setHistoryError(false);
                                try {
                                    await props.loadOlder();
                                }
                                catch {
                                    setHistoryError(true);
                                }
                            }, children: loadingOlder ? '正在加载更早记录' : '加载更早记录' }), historyError && _jsx("div", { className: css.notice, children: "\u5386\u53F2\u8BB0\u5F55\u52A0\u8F7D\u5931\u8D25\uFF0C\u53EF\u518D\u6B21\u5C1D\u8BD5\uFF1B\u73B0\u6709\u5185\u5BB9\u672A\u6539\u53D8\u3002" }), openError && _jsxs("div", { className: css.error, role: "alert", children: ["\u4F1A\u8BDD\u6682\u65F6\u65E0\u6CD5\u8BFB\u53D6\uFF1A", openError.message] }), loading && groups.length === 0 && _jsx("p", { className: css.empty, role: "status", children: "\u6B63\u5728\u8BFB\u53D6\u4F1A\u8BDD\u2026" }), groups.map(group => _jsx(TurnGroup, { ...props, group: group, motion: motion, autoFold: autoFold, pinnedKeys: pinnedKeys, selectedProcessKeys: selectedProcessKeys, isAwaitingModel: isAwaitingModel && group.key === groups.at(-1)?.key }, group.key)), visibleSubmissions.map(submission => {
                            const images = pendingSubmissionImages(submission);
                            return (_jsxs("div", { className: css.userCluster, "data-reader-pending-submission": true, children: [images.length > 0 && (_jsx("div", { className: css.userImages, children: images.map((item, idx) => (_jsx("figure", { className: css.imageFigure, children: _jsx("div", { className: css.imageFrame, style: { aspectRatio: `${item.width || 4} / ${item.height || 3}` }, children: _jsx("img", { src: item.previewUrl, alt: item.name ?? '发送的图片', className: css.pendingImage }) }) }, idx))) })), submission.text ? (_jsx("div", { className: css.user, children: _jsx("div", { className: css.blocks, children: submission.text }) })) : null, _jsx(UserMessageActions, { text: submission.text ?? '', time: submission.time })] }, submission.requestId));
                        }), isAwaitingModel && _jsx(WaitingStatus, { anchor: waitAnchor, label: props.t ? props.t('chat.deepDiving') : '深度求索中...' }), pending !== undefined && _jsxs("div", { className: css.attention, role: "alert", "data-reader-attention": true, children: [_jsx("strong", { children: pending.kind === 'question' ? '需要你回答一个问题' : '需要你的确认' }), _jsx("span", { children: "\u8BF7\u5728\u4E0B\u65B9\u539F\u751F\u64CD\u4F5C\u533A\u5904\u7406\u3002\u6B64\u63D0\u793A\u4E0D\u4F1A\u6536\u8FDB\u6267\u884C\u8FC7\u7A0B\u3002" })] }), scroll.detached && _jsx("div", { className: css.jumpDock, children: _jsx("button", { type: "button", className: css.jump, "aria-label": "\u56DE\u5230\u5E95\u90E8", title: "\u56DE\u5230\u5E95\u90E8", onClick: scroll.jump, children: _jsx("svg", { viewBox: "0 0 14 14", width: "14", height: "14", "aria-hidden": "true", children: _jsx("path", { d: "M3 5.5 7 9.5 11 5.5", fill: "none", stroke: "currentColor", strokeWidth: "1.4", strokeLinecap: "round", strokeLinejoin: "round" }) }) }) })] })] }) });
}
//# sourceMappingURL=Reader.js.map