import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path';
import * as workspacePathPkg from '@deepseek-ai/dsh-util-workspace-path';
import { dirname } from './deliverables.js';
import { isAbsoluteWorkspacePath } from '../workspace-path.js';
import { ensureStyles } from './styles.js';
import { Reader } from './Reader.js';
import { createReaderStore } from './store.js';
import { installReaderEntry } from './entry.js';
import { installBetterDisplaySettings } from './settings.js';
import { fillComposerDom } from './mcp-app.js';
import { fileAddressFor, modeFromSnapshot, openDeliverableFile } from './open-file.js';
import { installOfficialSlots, officialChildren } from './official-slots.js';
const officialFileAddressFor = workspacePathPkg.fileAddressFor;
async function openWorkspacePath(ctx, path) {
    const remote = ctx.remote;
    const remoteSession = remote?.session
        ?? ctx.get?.('remote.session')
        ?? (ctx.get?.('remote')?.session);
    if (remoteSession?.openWorkspacePath) {
        const result = await remoteSession.openWorkspacePath({ path });
        if (!result?.ok) {
            console.warn('[dsh-better-display] openWorkspacePath failed:', result?.error?.message);
        }
    }
    else {
        console.warn('[dsh-better-display] remote.session is not available');
    }
}
export { McpAppFrame } from './McpAppFrame.js';
export const name = 'dsh-better-display-client';
export const inject = ['slots', 'sessions', 'conversation', 'uiConversation', 'remote', 'remote.session'];
// All CSS imports have injected their nodes before this module's body runs.
ensureStyles();
export function apply(ctx) {
    const store = createReaderStore();
    // conversation.view is session-scoped, so session persist keys are
    // `dsh.reader.v1.<sessionId>`. One root instance keeps glass, fold
    // intensity, and open-mode on the unsuffixed `dsh.reader.v1` key.
    const prefs = store.create();
    installBetterDisplaySettings(ctx, prefs);
    ctx.slots.inject('conversation.chat.node', function* () {
        yield ctx.slots.register({
            name: 'conversation.view',
            id: 'reader',
            order: -5,
            label: () => '阅读',
            locale: 'chat',
            children: {
                'dsh-better-display.block': { kind: 'chain', scope: 'session' },
                ...officialChildren(ctx.slots),
            },
            store,
            inject: (sessionId) => {
                const session = () => {
                    const current = ctx.sessions.binding(sessionId)?.session;
                    if (!current)
                        throw new Error('阅读页对应的会话已关闭。');
                    return current;
                };
                return {
                    openPrefs: prefs,
                    officialImageLoader: Object.assign((attachment) => ctx.uiConversation.imageUrl(sessionId, attachment), { peek: (attachment) => ctx.uiConversation.peekImageUrl(sessionId, attachment) }),
                    officialFileMentions: owner => ctx.get('chatFileMentions')?.forClosing(owner, sessionId),
                    officialPreviewFile: path => {
                        const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
                        const sidebar = ctx.get('sidebarRight');
                        if (!sidebar?.openResource)
                            throw new Error('文件预览面板不可用。');
                        sidebar.openResource((officialFileAddressFor ?? fileAddressFor)(sessionId, cwd, path));
                    },
                    officialHost: {
                        getSnapshot: () => ctx.remote.$host,
                        subscribe: listener => ctx.on('connection/reset', listener),
                    },
                    loadOlder: async () => { await session().loadOlder(); },
                    loadImage: async (attachment) => {
                        const receipt = await session().readAttachment(attachment.attachmentId);
                        if (!receipt.ok)
                            throw new Error(receipt.error.message);
                        return { data: Uint8Array.from(receipt.value.data), mediaType: receipt.value.attachment.mediaType };
                    },
                    openFile: async (path, options) => {
                        try {
                            const cwd = ctx.sessions?.list?.getSnapshot?.()?.byId[sessionId]?.cwd;
                            const sidebar = (ctx.get?.('sidebarRight')
                                ?? ctx.sidebarRight);
                            await openDeliverableFile({
                                path,
                                mode: modeFromSnapshot(prefs),
                                sessionId,
                                cwd,
                                resolveWorkspacePath,
                                openExternal: async (absolutePath) => { await openWorkspacePath(ctx, absolutePath); },
                                openSidebar: typeof sidebar?.openResource === 'function'
                                    ? (address) => { sidebar.openResource(address, options?.line === undefined ? undefined : { params: { line: options.line } }); }
                                    : undefined,
                                fileAddressFor: officialFileAddressFor ?? fileAddressFor,
                                warn: (message, extra) => { console.warn(message, extra); },
                            });
                        }
                        catch (error) {
                            console.warn('[dsh-better-display] openFile error:', error);
                        }
                    },
                    revealFile: async (path) => {
                        try {
                            const cwd = ctx.sessions?.list?.getSnapshot?.()?.byId[sessionId]?.cwd;
                            const targetPath = resolveWorkspacePath(cwd, path);
                            // 1. Try dedicated host endpoint for native file highlighting (open -R / explorer /select)
                            try {
                                const res = await fetch('/better-display/reveal', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ path: targetPath, sessionId }),
                                });
                                if (res.ok) {
                                    const data = await res.json();
                                    if (data.ok)
                                        return;
                                }
                            }
                            catch {
                                // Server endpoint not yet available, fallback to directory open
                            }
                            // 2. Fallback to official opener with parent directory
                            const parentDir = dirname(targetPath);
                            if (!isAbsoluteWorkspacePath(parentDir)) {
                                console.warn('[dsh-better-display] reveal failed; refusing to open a relative parent:', targetPath);
                                return;
                            }
                            const remote = ctx.remote;
                            const remoteSession = remote?.session
                                ?? ctx.get?.('remote.session');
                            if (remoteSession?.openWorkspacePath) {
                                await remoteSession.openWorkspacePath({ path: parentDir });
                            }
                        }
                        catch (error) {
                            console.warn('[dsh-better-display] revealFile error:', error);
                        }
                    },
                    forkAt: (seq) => {
                        // A missing anchor would silently fork the whole session instead of
                        // the intended turn prefix, so refuse it loudly rather than guessing.
                        if (typeof seq !== 'number' || !Number.isFinite(seq)) {
                            console.warn('[dsh-better-display] fork refused: missing anchor seq');
                            return;
                        }
                        try {
                            const sessionsApi = ctx.sessions;
                            if (sessionsApi?.fork) {
                                sessionsApi.fork({ sessionId, atSeq: seq, increaseTitle: true })
                                    .then(childId => { sessionsApi.open?.(childId); })
                                    .catch(err => { console.warn('[dsh-better-display] fork failed:', err); });
                            }
                        }
                        catch (error) {
                            console.warn('[dsh-better-display] forkAt error:', error);
                        }
                    },
                    loadThrough: async (seq) => {
                        try {
                            const current = session();
                            if (typeof current?.loadThrough === 'function') {
                                await current.loadThrough(seq);
                            }
                            else {
                                await session().loadOlder();
                            }
                        }
                        catch (error) {
                            console.warn('[dsh-better-display] loadThrough error:', error);
                        }
                    },
                    fillComposer: (text) => {
                        // Sanctioned path: the conversation input shell owns the Lexical
                        // editor, so setDraft lands in the draft store deterministically.
                        try {
                            const conversation = ctx.conversation;
                            const shell = conversation?.input?.shell?.(sessionId);
                            if (shell && typeof shell.setDraft === 'function') {
                                shell.setDraft(text);
                                return true;
                            }
                        }
                        catch {
                            // Fall through to the DOM path below.
                        }
                        try {
                            return fillComposerDom(text);
                        }
                        catch {
                            return false;
                        }
                    },
                };
            },
        }, Reader);
        yield installOfficialSlots(ctx);
        yield installReaderEntry(ctx);
    });
}
//# sourceMappingURL=index.js.map