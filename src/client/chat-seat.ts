export type ChatSeatKind = 'user' | 'steering';

export function chatSeatProps(kind: ChatSeatKind, key: string): Record<string, string> {
  return {
    'data-chat-anchor-key': key,
    'data-chat-flow-key': key,
    'data-chat-node-key': key,
    'data-chat-flow-kind': kind,
  };
}

/**
 * The host's turn anchor on the turn-tail wrapper (`TurnTailNodeView`,
 * `data-turn-tail={data.turn}`), mirrored on the Reader's tail wrapper (#88).
 * The value is the turn number from that turn's `turn/end`. A turn that is
 * collapsing out after a rewind publishes no anchor, so a live turn that
 * reuses the number is the only match.
 */
export function turnTailAnchorProps(turn: number | null | undefined, retiring = false): Record<string, string> {
  return !retiring && typeof turn === 'number' && Number.isSafeInteger(turn) && turn >= 0
    ? { 'data-turn-tail': String(turn) }
    : {};
}
