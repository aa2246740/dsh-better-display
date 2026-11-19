export type ChatSeatKind = 'user' | 'steering';
export declare function chatSeatProps(kind: ChatSeatKind, key: string): Record<string, string>;
/**
 * The host's turn anchor on the turn-tail wrapper (`TurnTailNodeView`,
 * `data-turn-tail={data.turn}`), mirrored on the Reader's tail wrapper (#88).
 * The value is the turn number from that turn's `turn/end`. A turn that is
 * collapsing out after a rewind publishes no anchor, so a live turn that
 * reuses the number is the only match.
 */
export declare function turnTailAnchorProps(turn: number | null | undefined, retiring?: boolean): Record<string, string>;
//# sourceMappingURL=chat-seat.d.ts.map