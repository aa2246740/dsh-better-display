import type {
  ChatNodeOwnerProps,
  TurnTailOwnerProps
} from '@deepseek-ai/dsh-client-ui-chat/client';
import type { BlockRenderProps } from './types.js';

/**
 * Owner share for a mirrored `conversation.chat.node` renderer.
 *
 * Harness 0.2.1 requires `fileMentions` on `ChatNodeOwnerProps`. 0.2.2 moved
 * that function into the official assistant-step registration's inject, and
 * the slot renderer spreads owner props after injected props, so an owner key
 * would shadow that inject. The Reader does not mirror the official
 * assistant-step (priority 0). The nodes it does mount — user, steering, and
 * a lower-priority assistant replacement — do not receive that inject from
 * the host. Restoring the owner prop keeps a 0.2.1 renderer from throwing,
 * and the optional second argument is forwarded so a 0.2.2 context menu still
 * reaches `forClosing`.
 */
export function chatNodeOwner(
  render: Pick<BlockRenderProps, 'cwd' | 'openFile' | 'forkAt'>,
  official: Pick<
    NonNullable<BlockRenderProps['official']>,
    'openView' | 'officialImageLoader' | 'officialFileMentions'
  >
): ChatNodeOwnerProps {
  const owner = {
    cwd: render.cwd,
    openFile: render.openFile ?? (() => {}),
    forkAt: render.forkAt ?? (() => {}),
    inspectCall: (callId: string) => official.openView('trajectory', callId),
    loadImage: official.officialImageLoader,
    fileMentions: (tail: TurnTailOwnerProps, getFileTriggerProps?: (path: string) => unknown) =>
      official.officialFileMentions(tail, getFileTriggerProps)
  };
  return owner;
}
