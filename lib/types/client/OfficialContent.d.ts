import { type ReactNode } from 'react';
import type { AssistantActionOwnerProps, ChatConversationViewNode, ChatNode, TurnTailOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { AssistantBlock, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
type MessageId = AssistantActionOwnerProps['messageId'];
import type { BlockRenderProps } from './types.js';
export declare function OfficialActions({ official, messageId }: Pick<BlockRenderProps, 'official'> & {
    messageId?: MessageId;
}): import("react").JSX.Element | null;
export declare function OfficialTool({ official, block, toolName, cwd, openFile, fallback }: BlockRenderProps & {
    official: NonNullable<BlockRenderProps['official']>;
    block: ToolCallBlock;
    toolName: string;
    fallback: ReactNode;
}): import("react").JSX.Element;
export declare function OfficialNode({ node, fallback, ...render }: BlockRenderProps & {
    node: ChatConversationViewNode;
    fallback: ReactNode;
}): string | number | boolean | Iterable<ReactNode> | import("react").JSX.Element | null | undefined;
type AssistantBodyProps = BlockRenderProps & {
    node: ChatNode<'assistant-step'>;
    blocks: readonly AssistantBlock[];
    streaming?: boolean;
    holdFormatting?: boolean;
    startedAt?: number;
    interrupted?: boolean;
    liveText?: boolean;
};
/**
 * Body of one assistant segment. A mirrored assistant-step replacement draws
 * it; Reader markdown is the fallback when no replacement is registered.
 * The caller keeps reasoning blocks on the reading card.
 */
export declare function OfficialAssistantBody({ node, blocks, streaming, holdFormatting, startedAt, interrupted, liveText, ...render }: AssistantBodyProps): string | number | boolean | Iterable<ReactNode> | import("react").JSX.Element | null | undefined;
/**
 * `anchorTurn` is the turn number for the host's `data-turn-tail` anchor; omit
 * it and the wrapper carries none. The wrapper stays `display: contents`.
 */
export declare function OfficialTail({ official, owner, produced, anchorTurn }: Pick<BlockRenderProps, 'official'> & {
    owner?: TurnTailOwnerProps;
    produced: readonly string[];
    anchorTurn?: number;
}): import("react").JSX.Element | null;
export {};
//# sourceMappingURL=OfficialContent.d.ts.map