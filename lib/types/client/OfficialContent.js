import { jsx as _jsx } from "react/jsx-runtime";
import { useSyncExternalStore } from 'react';
import { OFFICIAL_SEATS } from './official-slots.js';
export function OfficialActions({ official, messageId }) {
    if (!official || !messageId)
        return null;
    return _jsx("span", { "data-reader-official-actions": true, style: { display: 'contents' }, children: official.renderSlot(OFFICIAL_SEATS.actions, { messageId }) });
}
export function OfficialTool({ official, block, toolName, cwd, openFile, fallback }) {
    const home = useSyncExternalStore(official.officialHost.subscribe, official.officialHost.getSnapshot).home;
    return _jsx("div", { "data-reader-tool-official": true, children: official.renderSlot(OFFICIAL_SEATS.tools, {
            callId: block.callId, toolName, block, cwd, home,
            openFile: openFile ?? (() => { }),
            loadImage: official.officialImageLoader,
            inspect: () => official.openView('trajectory', block.callId),
        }, { entryKey: toolName, fallback }) });
}
export function OfficialNode({ node, fallback, ...render }) {
    const official = render.official;
    if (!official)
        return fallback;
    const owner = {
        cwd: render.cwd,
        openFile: render.openFile ?? (() => { }),
        openSkill: () => { },
        forkAt: render.forkAt ?? (() => { }),
        inspectCall: callId => official.openView('trajectory', callId),
        loadImage: official.officialImageLoader,
        renderMessageImages: images => official.renderSlot(OFFICIAL_SEATS.images, {
            ...images, loadImage: official.officialImageLoader,
        }),
        fileMentions: official.officialFileMentions,
    };
    const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
    // The runtime node domain is open; the public SlotMap enumerates the known kinds.
    const renderNode = official.renderSlot;
    return _jsx("div", { "data-reader-official-node": node.kind, "data-chat-anchor-key": node.key, "data-chat-flow-kind": node.kind, children: renderNode(OFFICIAL_SEATS.nodes, { ...owner, node }, { entryKey: node.kind, hookContext: turn?.data, fallback }) });
}
export function OfficialTail({ official, owner, produced }) {
    const tailOwner = owner && official ? { ...owner, openFile: official.officialPreviewFile, readerProducedPaths: produced } : undefined;
    return official && tailOwner ? _jsx("div", { "data-reader-official-tail": true, style: { display: 'contents' }, children: official.renderSlot(OFFICIAL_SEATS.tail, tailOwner) }) : null;
}
//# sourceMappingURL=OfficialContent.js.map