import type { ChatNodeKind } from '@deepseek-ai/dsh-client-ui-chat/client';
export interface WaitingAnchor {
    key: string;
    time: number | null;
}
type InputNode = {
    kind: string;
    data: unknown;
};
type Submission = {
    requestId: string;
    time?: number;
    placement?: string;
};
/**
 * Chat-layer kinds that hand the turn back to the model unconditionally.
 *
 * These are `ChatNodeDataMap` keys, NOT conversation-layer `ConversationNode` kinds.
 * The two layers name the same idea differently: a returned tool is `tool-result`
 * in the conversation contract, but the row the reader sees is the `tool-call` node.
 * A name copied from the wrong layer silently disables the branch it guards, so
 * the `satisfies` below makes the compiler reject any name that is not a real kind.
 */
export declare const WAIT_AFTER: Set<ChatNodeKind>;
/**
 * Every chat-kind the handover logic reasons about, checked against the host's own
 * kind union at compile time. Adding a name here that the host does not register
 * fails `tsc` instead of failing silently at runtime.
 */
export declare const HANDOVER_KINDS: readonly ["user", "steering", "context", "model-retry", "tool-call", "command"];
/**
 * Does this node leave the model on the hook for the next move?
 *
 * A tool or command that is *still running* is not a wait — the tool is the one
 * working. Only its returned form hands control back, which is exactly the moment
 * the model can stall. A settled command also needs `running`; see
 * {@link commandHandsOver}.
 *
 * @param running - the host's session running bit.
 */
export declare function handsBackToModel(node: InputNode, running: boolean): boolean;
/**
 * The moment the current wait began.
 *
 * This is the time of the **last** node that handed control to the model — a
 * returned tool, an injected context, or the user's own message. Anchoring on the
 * user's message alone made the readout count the entire turn, so a wait that had
 * only just begun showed the minutes the tools had already spent.
 */
export declare function waitingAnchor(order: readonly string[], get: (key: string) => InputNode | undefined, pending: readonly Submission[], running: boolean): WaitingAnchor;
export interface AwaitingModelInput {
    /** The host's session running bit. */
    running: boolean;
    /** Local submission echoes (`SessionSnapshot.pendingSubmissions`). */
    pending: readonly Submission[];
    /** Rendered chat keys, oldest first. */
    order: readonly string[];
    get: (key: string) => InputNode | undefined;
    /** Status of the turn the last rendered group belongs to; undefined when that group has no turn. */
    lastTurnStatus: string | undefined;
}
/**
 * Should the reader show the "深度求索中" wait after the last row?
 *
 * 状态机铁律：「深度求索中」与「正在处理/思考」永远互斥。
 */
export declare function awaitingModel({ running, pending, order, get, lastTurnStatus }: AwaitingModelInput): boolean;
export {};
//# sourceMappingURL=waiting-clock.d.ts.map