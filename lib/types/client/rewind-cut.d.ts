/**
 * Which chat rows a `/rewind` withdrew, expressed as a pure function of the
 * chat snapshot.
 *
 * WHY THIS EXISTS. A rewind never deletes history: the host appends one
 * replacement `user/message` marker whose `surfaceOp` shadows everything after
 * the target, and the transcript must then read as it did *before* the target
 * was sent. The official ChatView is a per-node renderer, so the rewind plugin
 * (`dsh-rewind-plugin`) hides withdrawn rows by DOM: it computes the shadowed
 * anchor seqs from the command node and sets `display:none` on every element
 * carrying the official `data-chat-anchor-key` seat attribute.
 *
 * The Reader replaces ChatView's message list and renders its own row shapes
 * (turn sections, answer articles, tool rows), so it does not republish that
 * seat attribute on every row. DOM hiding therefore reaches only the user and
 * steering bubbles, and every other withdrawn row — the answer, the tool rows,
 * and the `/rewind` command row itself — stayed on screen. That is the reported
 * defect: the command is recorded as a rewind row instead of the Reader rolling
 * back to the state before the message was sent.
 *
 * The Reader decides visibility from React state, so it must apply the same
 * contract itself instead of waiting for a third-party MutationObserver. The
 * marker node is not admitted as a chat node (only append-origin surface events
 * become nodes), so the command node's `outcome.sourceEventSeq` — the marker's
 * log seq — plus the `@<seq>` target in its `args` are the only client-side
 * signal for the shadowed range. This mirrors the plugin's own reader of that
 * contract, and is pinned by `tests/rewind-cut.test.ts` so a plugin or host
 * change cannot silently regress it.
 *
 * @module dsh-better-display/rewind-cut
 */
/** A chat-snapshot view node, read structurally (only the fields this module needs). */
export interface CutChatNode {
    readonly key: string;
    readonly kind?: string;
    readonly anchorSeq?: number;
    readonly visibility?: string;
    readonly data?: unknown;
    /**
     * Where the host placed the node in the session's location index. Only the
     * owning turn is read from it, and an absent or foreign location is fine.
     */
    readonly location?: unknown;
}
/** The minimal chat-snapshot reader the cut logic needs. */
export interface CutChat {
    readonly order: readonly string[];
    readonly nodes: {
        get(key: string): CutChatNode | undefined;
    };
}
/** One closed shadow range `[start, end]` in surface/anchor seq space. */
export interface CutSpan {
    readonly start: number;
    readonly end: number;
}
/**
 * The render POSITION a row is anchored at: the view node's `anchorSeq`, else
 * its payload seq.
 *
 * This is deliberately NOT integer-only. The host anchors synthetic rows at
 * fractional offsets off a real seq (`CHAT_SYNTHETIC_SEQ_OFFSETS` in the
 * official ChatView: `turn-process` at `controlAnchorSeq - 0.1`, `turn-tail` at
 * `seq + 0.1`, an interrupted assistant step at `seq - 0.9`). An integer-only
 * read made those rows invisible to the cut, so the last `turn-process` of a
 * withdrawn turn survived on its own. Log seqs (marker, target) stay integer:
 * see `safeSeq`.
 */
export declare function anchorSeqOf(node: CutChatNode): number | undefined;
/**
 * Extract the rewind target seq from a `/rewind` command's structured `args`
 * (e.g. `@5 chat`, `preview @5 both`). Locale-independent: it never parses the
 * host's human outcome copy.
 */
export declare function rewindTargetOfArgs(args: unknown): number | undefined;
/**
 * Merge overlapping or touching shadow ranges.
 *
 * Spans are kept SEPARATE unless they genuinely overlap: collapsing every cut
 * to `[min target, max marker]` would hide a still-on-surface gap of new traffic
 * between an earlier marker and a later target.
 */
export declare function coalesceCutSpans(spans: readonly CutSpan[]): CutSpan[];
/**
 * True when a row anchored at `seq` falls inside one of the cut spans.
 *
 * A cut runs from the target seq through the marker's own log seq, and the
 * comparison is closed at the top only up to the NEXT INTEGER. That widening is
 * load-bearing: not every withdrawn row is a plain log event. The host anchors
 * synthetic rows at fractional offsets off a real seq (`CHAT_SYNTHETIC_SEQ_OFFSETS`
 * in the official ChatView — `turn-process` at `controlAnchorSeq - 0.1`,
 * `turn-tail` at `seq + 0.1`), and a withdrawn assistant step can be
 * re-anchored at `interruptedAt.seq - 0.9`. A marker at seq N therefore has to
 * cover synthetic anchors in `[N, N + 1)` as well, or the last `turn-process`
 * of a withdrawn turn survives alone. Spans stay disjoint: a seq before the next
 * span's start is never swept up, so new traffic between two rewinds survives.
 */
export declare function cutContains(cuts: readonly CutSpan[], seq: number): boolean;
/**
 * The shadow ranges a session's executed rewinds produced, newest state last.
 * An executed rewind cuts `[target, marker]` — the target itself is included,
 * because a rewind restores the state *before* that message was sent (its text
 * goes back to the composer).
 */
export declare function rewindCutSpans(chat: CutChat | undefined): CutSpan[];
/**
 * The anchor seqs the Reader must not render: every withdrawn message (the
 * target, everything after it, and the unrendered marker), plus every `/rewind`
 * row that exists only to feed the popover — the candidate-list probe and each
 * impact preview. A SUCCESSFUL executed command row is covered by its own cut;
 * a failed or unsettled one stays visible as an ordinary command record.
 */
export declare function hiddenRewindSeqs(chat: CutChat | undefined): Set<number>;
/**
 * The chat keys the Reader should render, in snapshot order: withdrawn rows and
 * rows the host itself marked hidden are dropped, everything else keeps its
 * position. Returns the snapshot's own `order` array when nothing is filtered,
 * so React selectors see a stable reference.
 */
export declare function visibleChatKeys(chat: CutChat): readonly string[];
/**
 * A comparable signal for the visible row set, built for
 * `useSyncExternalStore`-style subscription: the host re-runs a chat selector
 * on every publish and compares the RESULT by `Object.is`, and a rewind
 * publishes an in-place upsert of an existing command row. The snapshot's
 * `order` array and node store are therefore both reference-stable across a
 * rewind, so a selector on them never re-renders; a string does change exactly
 * when the visible set does. Never return the array itself from a selector —
 * a fresh array fails the `Object.is` check on every publish.
 */
export declare function visibleChatSignature(chat: CutChat): string;
//# sourceMappingURL=rewind-cut.d.ts.map