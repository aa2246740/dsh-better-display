import { Component } from 'react';
import type { ReactNode } from 'react';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AssistantBlock, UserMessageNode } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { BlockRenderProps, ReaderBlockOwner } from './types.js';
export declare class BlockBoundary extends Component<{
    children: ReactNode;
}, {
    failed: boolean;
    detail: string;
}> {
    state: {
        failed: boolean;
        detail: string;
    };
    static getDerivedStateFromError(error: unknown): {
        failed: boolean;
        detail: string;
    };
    render(): string | number | boolean | Iterable<ReactNode> | import("react").JSX.Element | null | undefined;
}
/**
 * The source path a tool call named, for the pictures that call returned.
 *
 * A tool result carries the call's arguments (`args`, and the raw `call.argsRaw`), and
 * for an image tool those arguments name the file. That is the only place a full path
 * survives: `ImageAttachmentRef.name` is documented as "stripped of local path
 * information", so the attachment alone can never say where a picture came from.
 */
export declare const ToolPathContext: import("react").Context<string | undefined>;
/** Re-exported so callers keep one import: the logic lives in `tool-path.ts`. */
export { pathFromToolArgs } from './tool-path.js';
export declare const ImageBlock: import("react").MemoExoticComponent<({ attachment, loadImage }: {
    attachment: ImageAttachmentRef;
    loadImage: BlockRenderProps["loadImage"];
}) => import("react").JSX.Element>;
export declare function contentBlocks(content: UserMessageNode['content']): AssistantBlock[];
type TextPresentation = {
    startedAt?: number;
    interrupted?: boolean;
    liveText?: boolean;
};
export declare const Blocks: import("react").MemoExoticComponent<({ blocks, streaming, source, holdFormatting, startedAt, interrupted, liveText, renderSlotChain, loadImage, fillComposer, fileMentions, cwd }: BlockRenderProps & TextPresentation & {
    blocks: readonly AssistantBlock[];
    streaming?: boolean;
    source?: ReaderBlockOwner["source"];
    holdFormatting?: boolean;
}) => import("react").JSX.Element>;
export declare function CopyAnswer({ blocks, onFork, metrics, extraActions }: {
    blocks: readonly AssistantBlock[];
    onFork?: () => void;
    metrics?: BlockRenderProps['metrics'];
    extraActions?: ReactNode;
}): import("react").JSX.Element | null;
export declare function UserMessageActions({ text, time }: {
    text: string;
    time?: number;
}): import("react").JSX.Element | null;
//# sourceMappingURL=Blocks.d.ts.map