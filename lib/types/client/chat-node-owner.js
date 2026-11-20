/**
 * Owner share for a mirrored `conversation.chat.node` renderer. Harness 0.2.2
 * moved `fileMentions` out of `ChatNodeOwnerProps` and into the assistant-step
 * registration's own inject (`fileMentions(owner, getFileTriggerProps)`). The
 * slot renderer spreads owner props after injected props, so a Reader owner
 * key with that name would shadow a renderer's injected face. It is omitted.
 */
export function chatNodeOwner(render, official) {
    return {
        cwd: render.cwd,
        openFile: render.openFile ?? (() => { }),
        forkAt: render.forkAt ?? (() => { }),
        inspectCall: callId => official.openView('trajectory', callId),
        loadImage: official.officialImageLoader
    };
}
//# sourceMappingURL=chat-node-owner.js.map