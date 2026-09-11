import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AssistantBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-chat/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { createReaderStore } from './store.js';

export interface ReaderBlockOwner {
  block: AssistantBlock;
  streaming: boolean;
  source: 'assistant' | 'user' | 'tool';
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Trusted installed renderers may opt in; unknown model payloads never execute code. */
    'dsh-better-display.block': { kind: 'chain'; scope: 'session'; owner: ReaderBlockOwner };
  }
}

export interface ReaderInjected {
  loadOlder: () => Promise<void>;
  loadImage: (attachment: ImageAttachmentRef) => Promise<{ data: Uint8Array; mediaType: string }>;
  /**
   * Writes text into this session's composer draft via the sanctioned
   * conversation input face, with a DOM fallback. Returns true when the
   * composer accepted the text.
   */
  fillComposer: (text: string) => boolean;
  /** Open a workspace file or directory in the native host editor / file viewer. */
  openFile: (path: string) => Promise<void> | void;
  /** Reveal and highlight a workspace file in macOS Finder or Windows Explorer. */
  revealFile?: (path: string) => Promise<void> | void;
  /** Fork the conversation at a specific message sequence into a new branch session. */
  forkAt?: (seq: number) => void;
  /** Load session history through a target sequence number. */
  loadThrough?: (seq: unknown) => Promise<void>;
}
export type ReaderProps = PropsRuntime<'conversation.view'>
  & PropsLocale<'chat'>
  & PropsRenderSlots<'dsh-better-display.block'>
  & PropsStore<ReturnType<typeof createReaderStore>>
  & ReaderInjected;
export type BlockRenderProps = Pick<ReaderProps, 'renderSlotChain' | 'loadImage' | 'fillComposer'> & {
  openFile?: (path: string) => Promise<void> | void;
  revealFile?: (path: string) => Promise<void> | void;
  forkAt?: (seq: number) => void;
  /** Durable closing-message seq of this turn (turn-tail closing), used as the fork anchor. */
  forkSeq?: number;
  fileMentions?: MarkdownFileMentions;
  metrics?: {
    usage?: NonNullable<import('@deepseek-ai/dsh-client-ui-chat/client').TurnTailChatData['tokenUsage']>;
    runMs?: number;
    tokensPerSecond?: number;
    ttftMs?: number;
    /** Closing assistant-message time (turn-tail `closing.time`). */
    endedAt?: number;
  };
};
