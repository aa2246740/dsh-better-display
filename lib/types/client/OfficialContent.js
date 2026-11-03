import { jsx as _jsx } from "react/jsx-runtime";
import { useCallback, useState, useSyncExternalStore } from 'react';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import { OFFICIAL_SEATS, readerGroupAction } from './official-slots.js';
import { chatSeatProps } from './chat-seat.js';
import { Blocks } from './Blocks.js';
export function OfficialActions({ official, messageId }) {
    if (!official || !messageId)
        return null;
    return _jsx("span", { "data-reader-official-actions": true, style: { display: 'contents' }, children: official.renderSlot(OFFICIAL_SEATS.actions, { messageId }) });
}
/** Each atomic Tool view owns its disclosure state through this stable Hook prop. */
const useToolDisclosure = () => {
    const [expanded, setExpanded] = useState(false);
    const toggle = useCallback(() => setExpanded(previous => !previous), []);
    return { expanded, setExpanded, toggle };
};
export function OfficialTool({ official, block, toolName, cwd, openFile, fallback }) {
    const home = useSyncExternalStore(official.officialHost.subscribe, official.officialHost.getSnapshot).home;
    return _jsx("div", { "data-reader-tool-official": true, children: official.renderSlot(OFFICIAL_SEATS.tools, {
            callId: block.callId, toolName,
            phase: 'kind' in block ? 'result' : block.phase, block, cwd, home,
            openFile: openFile ?? (() => { }),
            loadImage: official.officialImageLoader,
            useDisclosure: useToolDisclosure,
            inspect: () => official.openView('trajectory', block.callId),
        }, { entryKey: toolName, hookContext: { callId: block.callId, assistant: undefined }, fallback }) });
}
function chatNodeOwner(render, official) {
    return {
        cwd: render.cwd,
        openFile: render.openFile ?? (() => { }),
        forkAt: render.forkAt ?? (() => { }),
        inspectCall: callId => official.openView('trajectory', callId),
        loadImage: official.officialImageLoader,
        fileMentions: official.officialFileMentions,
    };
}
function nodeHookContext(turnData, disclosureReset) {
    return { turnData, disclosureReset, useGroupAction: readerGroupAction };
}
export function OfficialNode({ node, fallback, ...render }) {
    const official = render.official;
    const [disclosureReset] = useState(() => createSnapshotStore(0));
    if (!official)
        return fallback;
    const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
    // The runtime node domain is open; the public SlotMap enumerates the known kinds.
    const renderNode = official.renderSlot;
    return _jsx("div", { "data-reader-official-node": node.kind, ...(node.kind === 'user' || node.kind === 'steering' ? chatSeatProps(node.kind, node.key) : {}), children: renderNode(OFFICIAL_SEATS.nodes, { ...chatNodeOwner(render, official), node }, { entryKey: node.kind, hookContext: nodeHookContext(turn?.data, disclosureReset), fallback }) });
}
/**
 * Body of one assistant segment. A mirrored assistant-step replacement draws
 * it; Reader markdown is the fallback when no replacement is registered.
 * The caller keeps reasoning blocks on the reading card.
 */
export function OfficialAssistantBody({ node, blocks, streaming = false, holdFormatting = false, startedAt, interrupted = false, liveText = false, ...render }) {
    const official = render.official;
    const [disclosureReset] = useState(() => createSnapshotStore(0));
    const fallback = _jsx(Blocks, { ...render, blocks: blocks, streaming: streaming, holdFormatting: holdFormatting, startedAt: startedAt, interrupted: interrupted, liveText: liveText });
    if (!official)
        return fallback;
    const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
    const sameBlocks = blocks.length === node.data.blocks.length && blocks.every((block, index) => block === node.data.blocks[index]);
    const view = sameBlocks ? node : { ...node, data: { ...node.data, blocks } };
    const renderNode = official.renderSlot;
    // groupPart matches the host split: response skips reasoning. The block
    // slice is what a replacement that ignores groupPart actually receives.
    return renderNode(OFFICIAL_SEATS.nodes, { ...chatNodeOwner(render, official), node: view, groupPart: 'response' }, {
        entryKey: 'assistant-step',
        hookContext: nodeHookContext(turn?.data, disclosureReset),
        fallback,
    });
}
export function OfficialTail({ official, owner, produced }) {
    const tailOwner = owner && official ? { ...owner, openFile: official.officialPreviewFile, readerProducedPaths: produced } : undefined;
    return official && tailOwner ? _jsx("div", { "data-reader-official-tail": true, style: { display: 'contents' }, children: official.renderSlot(OFFICIAL_SEATS.tail, tailOwner) }) : null;
}
//# sourceMappingURL=OfficialContent.js.map