import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Fragment, memo } from 'react';
import { Blocks, CopyAnswer } from './Blocks.js';
import { ReasoningCard } from './ReasoningCard.js';
import { OfficialActions, OfficialAssistantBody } from './OfficialContent.js';
import { Disclosure, ProcessFragment } from './motion.js';
import { FoldSummaryText } from './LiveFold.js';
import { ImageBand, ANSWER_BAND } from './image-group.js';
import { assistantSegments, forkAnchorSeq, hasVisibleBody, isEarlierNarration } from './projection.js';
import css from './Reader.module.css';
function isNode(node, kind) {
    return node.kind === kind;
}
export const AssistantNode = memo(function AssistantNode({ useChat, nodeKey, boundary, processOpen = false, pinned = false, folded = false, partStart, seamSummary, seamAfter = false, motion, onRead, returnFocusTo, ...render }) {
    const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
    if (!node || node.visibility === 'hidden' || !isNode(node, 'assistant-step'))
        return null;
    const data = node.data;
    const parts = assistantSegments(data.blocks);
    const earlier = isEarlierNarration(data, boundary);
    const hasToolCalls = data.blocks.some(block => block.kind === 'tool-call');
    const isProcessStep = earlier ||
        folded ||
        hasToolCalls ||
        (boundary.latestStep > 0 && data.step < boundary.latestStep);
    const body = data.blocks.filter(block => block.kind !== 'reasoning' && block.kind !== 'tool-call');
    const visible = partStart === undefined ? parts : parts.filter(part => part.start === partStart);
    const bodyProps = {
        streaming: data.status === 'running',
        holdFormatting: pinned,
        startedAt: data.time,
        interrupted: data.status === 'interrupted',
        liveText: true
    };
    // These pictures belong to the ANSWER band. The viewer itself lives one level up, on
    // the turn, so that opening from a tool call can page into them too — the reader
    // asked for exactly that asymmetry: from a tool you see everything, from the answer
    // you see only the answer.
    return (_jsx(ImageBand, { rank: ANSWER_BAND, children: visible.map(part => {
            const index = parts.findIndex(item => item.start === part.start);
            const last = index === parts.length - 1;
            if (part.kind === 'reasoning')
                return (_jsx(ProcessFragment, { open: processOpen, motion: motion, onRead: onRead, returnFocusTo: returnFocusTo, nodeKey: nodeKey, framed: true, children: _jsx(ReasoningCard, { step: data.step, active: processOpen && boundary.status === 'open' && data.step === boundary.latestStep, motion: motion, selected: pinned, onRead: onRead, children: _jsx(Blocks, { ...render, blocks: part.blocks, streaming: data.status === 'running' && last && data.blocks.at(-1)?.kind === 'reasoning', holdFormatting: pinned, startedAt: data.time, interrupted: data.status === 'interrupted', liveText: true }) }) }, part.start));
            if (!hasVisibleBody(part.blocks))
                return null;
            // Narration stays body prose and never enters a disclosure. The seam in
            // the gap summarises folded process between two body blocks. A foreign
            // assistant-step renderer receives these original blocks; Reader markdown,
            // including the text transform, is only the fallback.
            const isFinalAnswer = !isProcessStep;
            return (_jsxs(Fragment, { children: [seamSummary && (_jsx("div", { className: css.processSeamRow, "data-reader-process-seam": true, "data-reader-process-seam-summary": seamSummary, children: _jsx(Disclosure, { open: false, onChange: () => onRead(), ariaLabel: "\u88AB\u6298\u53E0\u7684\u8FC7\u7A0B", label: _jsx(FoldSummaryText, { summary: seamSummary, motion: false }) }) })), _jsxs("article", { className: css.answer, "data-reader-body": true, "data-reader-anchor": true, "data-reader-key": nodeKey, "data-reader-source-start": part.start, "data-reader-seam-after": seamAfter || undefined, "data-answer-status": data.status, "data-answer-phase": isFinalAnswer ? 'body' : 'process', children: [_jsx(OfficialAssistantBody, { ...render, node: node, blocks: part.blocks, ...bodyProps }), isFinalAnswer && last && data.status === 'interrupted' && (_jsx("span", { className: css.stopped, children: "\u5DF2\u505C\u6B62" })), isFinalAnswer &&
                                last &&
                                data.status !== 'running' &&
                                boundary.status === 'closed' && (_jsx(CopyAnswer, { blocks: body, onFork: (() => {
                                    // The fork anchor must be the durable closing message seq (same as
                                    // the official turn-tail branch). AssistantChatData carries no seq
                                    // of its own; passing it would fork the whole session instead.
                                    const anchor = forkAnchorSeq([data.finalNode, { seq: render.forkSeq }]);
                                    return render.forkAt && anchor !== undefined
                                        ? () => render.forkAt(anchor)
                                        : undefined;
                                })(), metrics: render.metrics, extraActions: _jsx(OfficialActions, { official: render.official, messageId: data.finalNode?.messageId }) }))] })] }, part.start));
        }) }));
});
//# sourceMappingURL=AssistantNode.js.map