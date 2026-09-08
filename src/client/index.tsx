import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-api-session-controller/client';
import type { SessionId } from '@deepseek-ai/dsh-session/types';
import { resolveWorkspacePath } from '@deepseek-ai/dsh-util-workspace-path';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import { Reader } from './Reader.js';
import { createReaderStore } from './store.js';
import { installReaderEntry } from './entry.js';
import { fillComposerDom } from './mcp-app.js';
import type { ReaderInjected } from './types.js';

/** Structural face of the sanctioned per-session composer writer. */
interface ComposerShell {
  setDraft: (text: string) => void;
}
interface ConversationFace {
  input?: { shell?: (id: SessionId) => ComposerShell };
}

export type { ReaderBlockOwner } from './types.js';
export { McpAppFrame } from './McpAppFrame.js';
export const name = 'dsh-better-display-client';
export const inject = ['slots', 'sessions', 'conversation', 'remote'];

export function apply(ctx: Context): void {
  const store = createReaderStore();
  const faces = new Map<SessionId, ReaderInjected>();
  ctx.effect(() => () => { faces.clear(); });
  ctx.slots.inject('conversation.view', function* () {
    yield ctx.slots.register({
    name: 'conversation.view',
    id: 'reader',
    order: -5,
    label: () => '阅读',
    locale: 'chat',
    children: { 'dsh-better-display.block': { kind: 'chain', scope: 'session' } },
    store,
    inject: (sessionId: SessionId): ReaderInjected => {
      const existing = faces.get(sessionId);
      if (existing) return existing;
      const session = () => {
        const current = ctx.sessions.binding(sessionId)?.session;
        if (!current) throw new Error('阅读页对应的会话已关闭。');
        return current;
      };
      const face: ReaderInjected = {
        loadOlder: async () => { await session().loadOlder(); },
        loadImage: async attachment => {
          const receipt = await session().readAttachment(attachment.attachmentId);
          if (!receipt.ok) throw new Error(receipt.error.message);
          return { data: Uint8Array.from(receipt.value.data), mediaType: receipt.value.attachment.mediaType };
        },
        openFile: async (path: string) => {
          try {
            const cwd = ctx.sessions.list.getSnapshot().byId[sessionId]?.cwd;
            const targetPath = resolveWorkspacePath(cwd, path);
            const remote = ctx.remote as unknown as { session?: { openWorkspacePath: (arg: { path: string }) => Promise<{ ok: boolean; error?: { message: string } }> } } | undefined;
            if (remote?.session) {
              const result = await remote.session.openWorkspacePath({ path: targetPath });
              if (!result.ok) console.warn('openWorkspacePath failed:', result.error?.message);
            }
          } catch (error) {
            console.warn('openFile failed:', error);
          }
        },
        fillComposer: (text: string) => {
          // Sanctioned path: the conversation input shell owns the Lexical
          // editor, so setDraft lands in the draft store deterministically.
          try {
            const conversation = (ctx as unknown as { conversation?: ConversationFace }).conversation;
            const shell = conversation?.input?.shell?.(sessionId);
            if (shell && typeof shell.setDraft === 'function') {
              shell.setDraft(text);
              return true;
            }
          } catch {
            // Fall through to the DOM path below.
          }
          try {
            return fillComposerDom(text);
          } catch {
            return false;
          }
        },
      };
      faces.set(sessionId, face);
      return face;
    },
    }, Reader);
    yield installReaderEntry(ctx);
  });
}
