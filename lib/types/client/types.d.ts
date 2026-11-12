import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AssistantBlock, MessageImageLoader } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PropsLocale, PropsRenderSlots, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots';
import type { createReaderStore } from './store.js';
import type { OfficialSeat } from './official-slots.js';
import type { OpenFileOptions, TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
/**
 * Display inputs the Reader already computed for this block.
 * Older callers may omit the object. Registrants must tolerate that.
 */
export interface ReaderBlockPresentation {
    /** Assistant step time, when the Reader has one. */
    startedAt?: number;
    /** True when this step was interrupted. */
    interrupted?: boolean;
    /** True when this block may run the live reveal. */
    liveText?: boolean;
}
export interface ReaderBlockOwner {
    block: AssistantBlock;
    streaming: boolean;
    source: 'assistant' | 'user' | 'tool';
    /** Viewport and motion inputs. Absent on owners built before this field existed. */
    presentation?: ReaderBlockPresentation;
    /** Selection is holding Markdown formatting in place. */
    holdFormatting?: boolean;
    /** Same value as `presentation.liveText`, repeated so a registrant can read it directly. */
    liveText?: boolean;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /** Trusted installed renderers may opt in; unknown model payloads never execute code. */
        'dsh-better-display.block': {
            kind: 'chain';
            scope: 'session';
            owner: ReaderBlockOwner;
        };
    }
}
export interface ReaderInjected {
    loadOlder: () => Promise<void>;
    loadImage: (attachment: ImageAttachmentRef) => Promise<{
        data: Uint8Array;
        mediaType: string;
    }>;
    /**
     * Writes text into this session's composer draft via the sanctioned
     * conversation input face, with a DOM fallback. Returns true when the
     * composer accepted the text.
     */
    fillComposer: (text: string) => boolean;
    /** Open a workspace file or directory; mode comes from the Better Display setting. */
    openFile: (path: string, options?: OpenFileOptions) => Promise<void> | void;
    officialImageLoader: MessageImageLoader;
    officialFileMentions: (owner: TurnTailOwnerProps) => MarkdownFileMentions | undefined;
    officialPreviewFile: (path: string) => void;
    officialHost: {
        getSnapshot: () => {
            home?: string;
        };
        subscribe: (listener: () => void) => () => void;
    };
    /** Root-scoped Better Display prefs (`dsh.reader.v1`), shared with Settings. */
    openPrefs?: {
        getSnapshot: () => {
            deliverableOpenMode?: import('./open-file.js').DeliverableOpenMode;
            frostedGlass?: boolean;
            foldIntensity?: import('./fold-intensity.js').FoldIntensity;
            autoFold?: boolean;
            processOnly?: boolean;
        };
        subscribe: (fn: () => void) => () => void;
        actions?: {
            setFoldIntensity?: (value: import('./fold-intensity.js').FoldIntensity) => void;
            setAutoFold?: (value: boolean) => void;
            setFrostedGlass?: (value: boolean) => void;
            setDeliverableOpenMode?: (value: import('./open-file.js').DeliverableOpenMode) => void;
        };
    };
    /** Reveal and highlight a workspace file in macOS Finder or Windows Explorer. */
    revealFile?: (path: string) => Promise<void> | void;
    /** Publishes the running clock row to the Host's composer dock. */
    clockLane?: import('./turn-clock-lane.js').ClockLane;
    /** Fork the conversation at a specific message sequence into a new branch session. */
    forkAt?: (seq: number) => void;
    /** Load session history through a target sequence number. */
    loadThrough?: (seq: unknown) => Promise<void>;
}
export type ReaderProps = PropsRuntime<'conversation.view'> & PropsLocale<'chat'> & PropsRenderSlots<'dsh-better-display.block' | OfficialSeat> & PropsStore<ReturnType<typeof createReaderStore>> & ReaderInjected;
export type BlockRenderProps = Pick<ReaderProps, 'renderSlotChain' | 'loadImage' | 'fillComposer'> & {
    official?: Pick<ReaderProps, 'renderSlot' | 'renderSlotChain' | 'officialImageLoader' | 'officialFileMentions' | 'officialPreviewFile' | 'officialHost' | 'openView'>;
    cwd?: string;
    openFile?: (path: string, options?: OpenFileOptions) => Promise<void> | void;
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
//# sourceMappingURL=types.d.ts.map