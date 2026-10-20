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

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function safeSeq(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** The command payload of a `command` chat node, when it is structurally readable. */
function commandOf(node: CutChatNode): Record<string, unknown> | undefined {
  if (node.kind !== "command") return undefined;
  return asRecord(node.data);
}

/**
 * The engine names an executed rewind command node can carry. The plugin
 * registers its command as `rewind-plugin` (`ENGINE_COMMANDS = new
 * Set(['rewind-plugin', 'rewind'])` in dsh-rewind-plugin's
 * `src/client/hidden.ts`), and that is the name the client projection actually
 * publishes — the session log's `command/run.name` is not what the Reader sees.
 * `rewind` stays accepted because older logs and the bili-side proxy record the
 * shorter spelling.
 */
const REWIND_COMMANDS: ReadonlySet<string> = new Set([
  "rewind-plugin",
  "rewind",
]);

/** True when a command payload is the rewind engine command, in either spelling. */
function isRewindCommand(command: Record<string, unknown>): boolean {
  return typeof command.name === "string" && REWIND_COMMANDS.has(command.name);
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
export function anchorSeqOf(node: CutChatNode): number | undefined {
  const raw = node.anchorSeq ?? asRecord(node.data)?.seq;
  return typeof raw === "number" && Number.isFinite(raw) && raw >= 0
    ? raw
    : undefined;
}

/**
 * Extract the rewind target seq from a `/rewind` command's structured `args`
 * (e.g. `@5 chat`, `preview @5 both`). Locale-independent: it never parses the
 * host's human outcome copy.
 */
export function rewindTargetOfArgs(args: unknown): number | undefined {
  if (typeof args !== "string") return undefined;
  const match = args.match(/@(\d+)/);
  return match === null ? undefined : Number(match[1]);
}

/** True for the internal candidate-list probe (`/rewind __candidates`). */
function isCandidateCommand(command: Record<string, unknown>): boolean {
  return (
    typeof command.args === "string" && command.args.includes("__candidates")
  );
}

/** True for an impact preview (`/rewind preview @5 both`). */
function isPreviewCommand(command: Record<string, unknown>): boolean {
  return typeof command.args === "string" && command.args.includes("preview");
}

/**
 * Merge overlapping or touching shadow ranges.
 *
 * Spans are kept SEPARATE unless they genuinely overlap: collapsing every cut
 * to `[min target, max marker]` would hide a still-on-surface gap of new traffic
 * between an earlier marker and a later target.
 */
export function coalesceCutSpans(spans: readonly CutSpan[]): CutSpan[] {
  if (spans.length < 2) return [...spans];
  const sorted = [...spans].sort(
    (left, right) => left.start - right.start || left.end - right.end,
  );
  const merged: { start: number; end: number }[] = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (last !== undefined && span.start <= last.end) {
      if (span.end > last.end) last.end = span.end;
      continue;
    }
    merged.push({ start: span.start, end: span.end });
  }
  return merged;
}

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
export function cutContains(cuts: readonly CutSpan[], seq: number): boolean {
  let low = 0;
  let high = cuts.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const cut = cuts[middle];
    if (cut === undefined) return false;
    if (seq < cut.start) high = middle - 1;
    else {
      found = middle;
      low = middle + 1;
    }
  }
  const span = found < 0 ? undefined : cuts[found];
  return span !== undefined && seq < span.end + 1;
}

/** The turn a node belongs to, read from its location (absent outside a turn). */
interface TurnRef {
  readonly id: unknown;
  readonly start: number;
}

function turnOf(node: CutChatNode): TurnRef | undefined {
  // The location's own `kind` varies (`turn` for a turn's synthetic rows,
  // `step` for one of its messages); only the turn it carries matters here.
  const turn = asRecord(asRecord(node.location)?.turn);
  const start = safeSeq(asRecord(turn?.start)?.seq);
  if (turn === undefined || start === undefined) return undefined;
  return { id: turn.turn, start };
}

/**
 * Node kinds that SUMMARIZE a turn instead of carrying its content, so the host
 * anchors them at the turn's edges rather than at an event inside it.
 */
const TURN_SUMMARY_KINDS: ReadonlySet<string> = new Set([
  "turn-process",
  "turn-tail",
]);

/**
 * The turns whose content was withdrawn.
 *
 * A rewind target is a user message, and the host opens its turn BEFORE the
 * message is logged (genuine session record: `turn/start`@5, `step/start`@7,
 * `user/message`@9), then anchors that turn's `turn-process` row at
 * `controlAnchorSeq - 0.1` — BELOW the earliest withdrawn event. Anchor
 * containment alone therefore always spares the process row of the very turn
 * that was withdrawn: the transcript rolled back but still announced
 * `执行过程 / 本轮已停止，已生成的内容仍保留。` That is the second reported
 * symptom, and it is why this rule reads the owning turn as well.
 */
function withdrawnTurnIds(
  chat: CutChat,
  cuts: readonly CutSpan[],
): Set<unknown> {
  const withdrawn = new Set<unknown>();
  if (cuts.length === 0) return withdrawn;
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node === undefined) continue;
    // Summary rows follow their turn; only content rows vote on the turn.
    if (TURN_SUMMARY_KINDS.has(node.kind ?? "")) continue;
    const seq = anchorSeqOf(node);
    if (seq === undefined || !cutContains(cuts, seq)) continue;
    const turn = turnOf(node);
    if (turn !== undefined) withdrawn.add(turn.id);
  }
  return withdrawn;
}

/**
 * True when a row must be withdrawn because its OWN TURN was withdrawn, even
 * though the host anchored it outside the cut.
 *
 * Identity, not position, is the predicate: the host anchors `turn-process` at
 * `turn.start.seq - 0.1` and `turn-tail` at `turn.end.seq + 0.1`, so a turn's
 * own edge rows sit deliberately OUTSIDE the range its events occupy. Any
 * positional guard (`turn.start <= anchorSeq`) therefore rejects exactly the
 * row this rule exists to retire — it did, and the stopped-turn notice stayed on
 * screen with every content row already withdrawn.
 */
function turnWithdrawn(
  node: CutChatNode,
  withdrawn: ReadonlySet<unknown>,
): boolean {
  const turn = turnOf(node);
  return turn !== undefined && withdrawn.has(turn.id);
}

/**
 * The shadow ranges a session's executed rewinds produced, newest state last.
 * An executed rewind cuts `[target, marker]` — the target itself is included,
 * because a rewind restores the state *before* that message was sent (its text
 * goes back to the composer).
 */
export function rewindCutSpans(chat: CutChat | undefined): CutSpan[] {
  if (chat === undefined) return [];
  const spans: CutSpan[] = [];
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node === undefined) continue;
    const command = commandOf(node);
    if (command === undefined || !isRewindCommand(command)) continue;
    const outcome = asRecord(command.outcome);
    if (outcome?.kind !== "success") continue;
    const marker = safeSeq(outcome.sourceEventSeq);
    if (marker === undefined) continue;
    const target = rewindTargetOfArgs(command.args);
    if (target === undefined) continue;
    spans.push({ start: target, end: marker });
  }
  return coalesceCutSpans(spans);
}

/**
 * The anchor seqs the Reader must not render: every withdrawn message (the
 * target, everything after it, and the unrendered marker), plus every `/rewind`
 * row that exists only to feed the popover — the candidate-list probe and each
 * impact preview. A SUCCESSFUL executed command row is covered by its own cut;
 * a failed or unsettled one stays visible as an ordinary command record.
 */
export function hiddenRewindSeqs(chat: CutChat | undefined): Set<number> {
  const hidden = new Set<number>();
  if (chat === undefined) return hidden;
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node === undefined) continue;
    const command = commandOf(node);
    if (command === undefined || !isRewindCommand(command)) continue;
    if (isPreviewCommand(command) || isCandidateCommand(command)) {
      const seq = anchorSeqOf(node);
      if (seq !== undefined) hidden.add(seq);
    }
  }
  const cuts = rewindCutSpans(chat);
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node === undefined) continue;
    const seq = anchorSeqOf(node);
    if (seq === undefined) continue;
    if (cutContains(cuts, seq)) hidden.add(seq);
  }
  return hidden;
}

/**
 * The chat keys the Reader should render, in snapshot order: withdrawn rows and
 * rows the host itself marked hidden are dropped, everything else keeps its
 * position. Returns the snapshot's own `order` array when nothing is filtered,
 * so React selectors see a stable reference.
 */
export function visibleChatKeys(chat: CutChat): readonly string[] {
  const hidden = hiddenRewindSeqs(chat);
  const cuts = rewindCutSpans(chat);
  const withdrawn = withdrawnTurnIds(chat, cuts);
  const visible: string[] = [];
  for (const key of chat.order) {
    const node = chat.nodes.get(key);
    if (node === undefined) continue;
    if (node.visibility === "hidden") continue;
    const seq = anchorSeqOf(node);
    if (seq !== undefined && hidden.has(seq)) continue;
    // A row the host anchored OUTSIDE the cut can still belong to a withdrawn
    // turn — every synthetic turn row does, the process summary most visibly.
    if (turnWithdrawn(node, withdrawn)) continue;
    visible.push(key);
  }
  return visible.length === chat.order.length ? chat.order : visible;
}

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
export function visibleChatSignature(chat: CutChat): string {
  return visibleChatKeys(chat).join("\u0000");
}
