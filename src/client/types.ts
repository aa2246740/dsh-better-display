import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AssistantBlock } from '@deepseek-ai/dsh-client-runtime/client';
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';
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
}
export type ReaderProps = PropsRuntime<'conversation.view'>
  & PropsLocale<'conversation'>
  & PropsRenderSlots<'dsh-better-display.block'>
  & PropsStore<ReturnType<typeof createReaderStore>>
  & ReaderInjected;
export type BlockRenderProps = Pick<ReaderProps, 'renderSlotChain' | 'loadImage'>;
