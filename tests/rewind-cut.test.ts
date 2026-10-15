import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  anchorSeqOf,
  coalesceCutSpans,
  cutContains,
  hiddenRewindSeqs,
  rewindCutSpans,
  rewindTargetOfArgs,
  visibleChatKeys,
  visibleChatSignature,
  type CutChatNode,
} from '../src/client/rewind-cut.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Baseline first: the pure rule must go RED on the reported symptom before the
// Reader is wired to it, and the wiring/bundle assertions stay RED until then.

/** The pre-fix rule the Reader used: only the host's own hidden flag filtered rows. */
function legacyVisibleKeys(chat: {
  order: readonly string[];
  nodes: { get(key: string): CutChatNode | undefined };
}): readonly string[] {
  return chat.order.filter(
    (key) => chat.nodes.get(key)?.visibility !== "hidden",
  );
}

function chatOf(nodes: readonly CutChatNode[]): {
  order: readonly string[];
  nodes: { get(key: string): CutChatNode | undefined };
} {
  const map = new Map(nodes.map((node) => [node.key, node]));
  return { order: nodes.map((node) => node.key), nodes: map };
}

/**
 * A command node as the chat snapshot carries it (`commandFromDone`).
 *
 * `name` defaults to the spelling the client projection actually publishes —
 * `rewind-plugin`, the plugin's registered command id — because that is what
 * the live chat snapshot carries. The shorter `rewind` is what older session
 * logs recorded; both must be recognised.
 */
function rewindCommand(
  key: string,
  seq: number,
  args: string | null,
  marker: number | undefined,
  outcomeKind = "success",
  name = "rewind-plugin",
): CutChatNode {
  return {
    key,
    kind: "command",
    anchorSeq: seq,
    visibility: "visible",
    data: {
      kind: "command",
      seq,
      time: 1,
      commandId: key,
      name,
      args,
      outcome: {
        kind: outcomeKind,
        ...(marker === undefined ? {} : { sourceEventSeq: marker }),
      },
    },
  };
}

function message(
  key: string,
  kind: "user" | "steering" | "assistant-step" | "tool-call" | "turn-tail",
  seq: number,
): CutChatNode {
  return {
    key,
    kind,
    anchorSeq: seq,
    visibility: "visible",
    data: { seq, time: 1, content: [] },
  };
}

/**
 * The reported scenario: user@1, assistant@2, tool@3, then `/rewind @1 chat`
 * executed at seq 5 with marker seq 6. Everything from the target onward must
 * disappear from the Reader, including the `/rewind` command row itself.
 */
function rewoundSession() {
  return chatOf([
    message("user-1", "user", 1),
    message("assistant-2", "assistant-step", 2),
    message("tool-3", "tool-call", 3),
    rewindCommand("command-5", 5, "@1 chat", 6),
    message("turn-tail-4", "turn-tail", 4),
  ]);
}

test("a rewind withdraws the target and every row after it, command row included", () => {
  const chat = rewoundSession();
  const visible = visibleChatKeys(chat);
  assert.deepEqual(visible, []);
  assert.deepEqual(rewindCutSpans(chat), [{ start: 1, end: 6 }]);
  for (const seq of [1, 2, 3, 4, 5])
    assert.equal(
      hiddenRewindSeqs(chat).has(seq),
      true,
      `seq ${seq} must be withdrawn`,
    );
});

test("the pre-fix visibility rule reproduces the reported defect", () => {
  // Regression evidence for the fix, not a wish: with only the host's hidden
  // flag honoured, the withdrawn answer, tool row and `/rewind` command row all
  // survived — the exact symptom reported (the command is recorded, no rollback).
  const chat = rewoundSession();
  assert.deepEqual(legacyVisibleKeys(chat), [
    "user-1",
    "assistant-2",
    "tool-3",
    "command-5",
    "turn-tail-4",
  ]);
  assert.notDeepEqual(legacyVisibleKeys(chat), visibleChatKeys(chat));
});

test("a row before the target is never withdrawn", () => {
  const chat = chatOf([
    message("user-0", "user", 1),
    message("user-1", "user", 2),
    message("assistant-2", "assistant-step", 3),
    rewindCommand("command-4", 4, "@2 chat", 5),
  ]);
  assert.deepEqual(visibleChatKeys(chat), ["user-0"]);
});

test("only a successful, marker-carrying rewind cuts; failures and previews stay readable", () => {
  const failed = chatOf([
    message("user-1", "user", 1),
    rewindCommand("command-2", 2, "@1 chat", undefined, "error"),
  ]);
  assert.deepEqual(rewindCutSpans(failed), []);
  assert.deepEqual(visibleChatKeys(failed), ["user-1", "command-2"]);

  // A success without the marker seq (older host output) must not cut a guessed range.
  const markerless = chatOf([
    message("user-1", "user", 1),
    rewindCommand("command-2", 2, "@1 chat", undefined),
  ]);
  assert.deepEqual(rewindCutSpans(markerless), []);
  assert.deepEqual(visibleChatKeys(markerless), ["user-1", "command-2"]);
});

test("preview and candidate probe rows never surface in the transcript", () => {
  const chat = chatOf([
    message("user-1", "user", 1),
    rewindCommand("preview-2", 2, "preview @1 both", undefined),
    rewindCommand("candidates-3", 3, "__candidates", undefined),
  ]);
  assert.deepEqual(visibleChatKeys(chat), ["user-1"]);
});

test("separate rewinds keep separate spans so later traffic is not swallowed", () => {
  // rewind#1 cut [1, 4]; new user@5 survives; rewind#2 cut [5, 8].
  const spans = coalesceCutSpans([
    { start: 1, end: 4 },
    { start: 5, end: 8 },
  ]);
  assert.deepEqual(spans, [
    { start: 1, end: 4 },
    { start: 5, end: 8 },
  ]);
  assert.equal(cutContains(spans, 4), true);
  assert.equal(cutContains(spans, 5), true);
  // A gap between spans must not be collapsed into one range.
  assert.deepEqual(
    coalesceCutSpans([
      { start: 1, end: 4 },
      { start: 7, end: 9 },
    ]),
    [
      { start: 1, end: 4 },
      { start: 7, end: 9 },
    ],
  );
  assert.equal(
    cutContains(
      coalesceCutSpans([
        { start: 1, end: 4 },
        { start: 7, end: 9 },
      ]),
      5,
    ),
    false,
  );
  // The top of a cut reaches the next integer, because the host anchors
  // synthetic rows at fractional offsets off a real seq (`turn-tail` at
  // `seq + 0.1`), but it must NOT reach the next span's start.
  const gapped = coalesceCutSpans([
    { start: 1, end: 4 },
    { start: 7, end: 9 },
  ]);
  assert.equal(cutContains(gapped, 4.1), true);
  assert.equal(cutContains(gapped, 5.0), false);
  assert.equal(cutContains(gapped, 6.9), false);
  assert.equal(cutContains(gapped, 7.0), true);
  // Overlapping spans still merge.
  assert.deepEqual(
    coalesceCutSpans([
      { start: 1, end: 6 },
      { start: 4, end: 9 },
    ]),
    [{ start: 1, end: 9 }],
  );
});

test("malformed command payloads are skipped instead of throwing", () => {
  const chat = chatOf([
    { key: "broken", kind: "command", anchorSeq: 1, data: "not an object" },
    {
      key: "no-name",
      kind: "command",
      anchorSeq: 2,
      data: {
        args: "@1 chat",
        outcome: { kind: "success", sourceEventSeq: 3 },
      },
    },
    {
      key: "bad-marker",
      kind: "command",
      anchorSeq: 3,
      data: {
        name: "rewind-plugin",
        args: "@1 chat",
        outcome: { kind: "success", sourceEventSeq: "x" },
      },
    },
    {
      key: "bad-args",
      kind: "command",
      anchorSeq: 4,
      data: {
        name: "rewind",
        args: null,
        outcome: { kind: "success", sourceEventSeq: 9 },
      },
    },
    message("user-1", "user", 1),
  ]);
  assert.deepEqual(rewindCutSpans(chat), []);
  assert.deepEqual(visibleChatKeys(chat), [
    "broken",
    "no-name",
    "bad-marker",
    "bad-args",
    "user-1",
  ]);
});

test("anchorSeq falls back to the payload seq and target parsing is locale-independent", () => {
  assert.equal(anchorSeqOf({ key: "k", kind: "user", data: { seq: 7 } }), 7);
  assert.equal(anchorSeqOf({ key: "k", anchorSeq: 9, data: { seq: 7 } }), 9);
  assert.equal(anchorSeqOf({ key: "k", anchorSeq: -1, data: {} }), undefined);
  assert.equal(rewindTargetOfArgs("@12 chat"), 12);
  assert.equal(rewindTargetOfArgs("preview @3 both"), 3);
  assert.equal(rewindTargetOfArgs("chat"), undefined);
  assert.equal(rewindTargetOfArgs(undefined), undefined);
});

test("an unfiltered snapshot keeps its original order reference", () => {
  const chat = chatOf([
    message("user-1", "user", 1),
    message("assistant-2", "assistant-step", 2),
  ]);
  assert.equal(visibleChatKeys(chat), chat.order);
});

test("the Reader renders from the rewind cut instead of the raw snapshot order", () => {
  // The seam that was missing: the pure rule above is useless unless the Reader
  // actually filters its rows with it. Pin the wiring so a refactor cannot drop
  // it and silently restore the reported defect.
  const source = readFileSync(resolve(root, "src/client/Reader.tsx"), "utf8");
  assert.match(source, /visibleChatKeys/);
  // Quote-agnostic: the source is formatted by the project's own toolchain, so a
  // double-quoted import is still the same wiring.
  assert.ok(
    source.includes("from './rewind-cut.js'") ||
      source.includes('from "./rewind-cut.js"'),
  );
});

test("the Reader no longer drives its groups and waiting clock from the raw order", () => {
  // The raw snapshot order still feeds the pending-submission de-dup (a withdrawn
  // message is still *durable*, so its echo must not reappear as a local one),
  // but every render-facing consumer reads the filtered key list.
  const source = readFileSync(resolve(root, "src/client/Reader.tsx"), "utf8");
  assert.match(source, /groupNodes\(\s*renderKeys,/);
  // The call may be formatted across lines, so match the argument rather than
  // the argument-plus-comma.
  assert.match(source, /waitingAnchor\(\s*renderKeys/);
  assert.doesNotMatch(source, /groupNodes\(order,/);
  assert.doesNotMatch(source, /waitingAnchor\(order,/);
  assert.match(source, /observedInputIds\(order,/);
});

test("the committed client bundle carries the rewind cut", () => {
  const client = readFileSync(resolve(root, "lib/client.js"), "utf8");
  assert.match(client, /hiddenRewindSeqs|visibleChatKeys/);
  assert.match(client, /visibleChatSignature/);
});

test("the Reader subscribes to the visible set instead of reference-stable snapshot fields", () => {
  // The subscription seam: a rewind upserts an EXISTING command row in place, so
  // `snapshot.order` and `snapshot.nodes` keep their identity and a selector on
  // either never fires. The Reader must depend on the value-compared signature.
  const source = readFileSync(resolve(root, "src/client/Reader.tsx"), "utf8");
  // Matched across formatting: the formatter breaks the arrow onto its own line.
  assert.match(source, /useChat\([\s\S]{0,40}?visibleChatSignature\(snapshot\)/);
  assert.ok(source.includes("[order, nodes, rewindSignature]"));
});

test("a string signature is stable enough for an Object.is-compared selector", () => {
  const chat = chatOf([message("user-1", "user", 1)]);
  assert.equal(typeof visibleChatSignature(chat), "string");
  assert.equal(visibleChatSignature(chat), visibleChatSignature(chat));
  assert.equal(visibleChatSignature(chat), "user-1");
});

test("the signature flips the moment the rewind marker lands", () => {
  // Before the marker the command row is an ordinary record; after it, the cut
  // exists and the same row must be gone. Nothing about the row's KEY changes,
  // which is exactly why the memo needed a value signal rather than an identity.
  const before = chatOf([
    message("user-1", "user", 1),
    rewindCommand("command-2", 2, "@1 chat", undefined),
  ]);
  const after = chatOf([
    message("user-1", "user", 1),
    rewindCommand("command-2", 2, "@1 chat", 3),
  ]);
  assert.equal(visibleChatSignature(before), "user-1" + "\u0000" + "command-2");
  assert.equal(visibleChatSignature(after), "");
  assert.notEqual(visibleChatSignature(before), visibleChatSignature(after));
});

test("a withdrawn turn retires its own synthetic rows, which the host anchors before the cut", () => {
  // Measured live on the host (session 92667917, turn 1): the turn opens at 5,
  // its user message lands at 9, and its process row is anchored at
  // `controlAnchorSeq - 0.1` = 4.9 — BELOW the rewind target. Containment alone
  // therefore kept the stopped-turn notice on screen even after every content
  // row had been withdrawn: the second reported symptom.
  const turn = {
    turn: 1,
    start: { seq: 5 },
    end: { seq: 18 },
    status: "closed",
  };
  const chat = chatOf([
    {
      key: "input-message",
      kind: "user",
      anchorSeq: 9,
      visibility: "visible",
      location: { kind: "step", turn, step: 1 },
      data: { seq: 9 },
    },
    {
      key: "turn-process1",
      kind: "turn-process",
      anchorSeq: 4.9,
      visibility: "visible",
      location: { kind: "turn", turn },
      data: { controlAnchorSeq: 5, processStartSeq: 5 },
    },
    {
      key: "turn-tail1",
      kind: "turn-tail",
      anchorSeq: 18.1,
      visibility: "visible",
      location: { kind: "turn", turn },
      data: { turn: 1, seq: 18 },
    },
    {
      key: "preview",
      kind: "command",
      anchorSeq: 20,
      visibility: "visible",
      location: { kind: "session" },
      data: {
        kind: "command",
        seq: 20,
        name: "rewind-plugin",
        args: " preview @9 both",
        outcome: { kind: "success" },
      },
    },
    {
      key: "executed",
      kind: "command",
      anchorSeq: 22,
      visibility: "visible",
      location: { kind: "session" },
      data: {
        kind: "command",
        seq: 22,
        name: "rewind-plugin",
        args: " @9 chat",
        outcome: { kind: "success", sourceEventSeq: 23 },
      },
    },
  ]);
  assert.deepEqual(rewindCutSpans(chat), [{ start: 9, end: 23 }]);
  assert.deepEqual(visibleChatKeys(chat), []);
  assert.equal(visibleChatSignature(chat), "");
});

test("a later turn keeps its rows even though it shares the withdrawn turn number", () => {
  // Guard against over-reach: the turn rule reads a turn IDENTITY, and a row of
  // a different turn must survive no matter where it sits relative to the cut.
  const withdrawnTurn = {
    turn: 1,
    start: { seq: 5 },
    end: { seq: 18 },
    status: "closed",
  };
  const openTurn = {
    turn: 2,
    start: { seq: 30 },
    end: { seq: 40 },
    status: "closed",
  };
  const chat = chatOf([
    {
      key: "user-1",
      kind: "user",
      anchorSeq: 9,
      visibility: "visible",
      location: { kind: "step", turn: withdrawnTurn, step: 1 },
      data: { seq: 9 },
    },
    {
      key: "process-2",
      kind: "turn-process",
      anchorSeq: 29.9,
      visibility: "visible",
      location: { kind: "turn", turn: openTurn },
      data: { controlAnchorSeq: 30 },
    },
    rewindCommand("command-22", 22, " @9 chat", 23),
  ]);
  assert.deepEqual(visibleChatKeys(chat), ["process-2"]);
});

/**
 * Genuine host records, copied verbatim from a real session log
 * (`.../session-0be7b55b.../session.v4.jsonl.zstd`, two `/rewind` runs at
 * 2026-10-14). The synthetic cases above encode our reading of the contract;
 * this one refuses to drift from what the host actually writes.
 */
interface RealEventData {
  readonly commandId?: string;
  readonly name?: string;
  readonly args?: string | null;
  readonly kind?: string;
  readonly text?: string;
  readonly sourceEventSeq?: number;
  readonly source?: {
    readonly kind: string;
    readonly rpcId?: string;
    readonly clientTimeZone?: string;
  };
  readonly role?: string;
  readonly id?: string;
  readonly content?: readonly {
    readonly type: string;
    readonly text: string;
  }[];
}

interface RealEvent {
  readonly type: "command/run" | "command/done" | "user/message";
  readonly seq: number;
  readonly time: number;
  readonly data: RealEventData;
  readonly surfaceOp?:
    | "append"
    | {
        readonly op: string;
        readonly startSeq: number;
        readonly endSeq: number;
      };
  readonly sourceEventSeqs?: readonly number[];
}

const REAL_REWIND_EVENTS: readonly RealEvent[] = [
  {
    type: "command/run",
    seq: 821,
    time: 1791938178593,
    data: {
      commandId: "cmd-8c119757-12",
      name: "rewind",
      args: " preview @802 both",
      source: { kind: "user" },
    },
  },
  {
    type: "command/done",
    seq: 822,
    time: 1791938178678,
    data: {
      commandId: "cmd-8c119757-12",
      kind: "success",
      text: "Rewind to seq 802, removing 2 node(s) from the model context (conversation log kept).\nNo restorable changes after the target.\nimpact=0",
    },
  },
  {
    type: "command/run",
    seq: 823,
    time: 1791938179674,
    data: {
      commandId: "cmd-8c119757-13",
      name: "rewind",
      args: " @802 chat",
      source: { kind: "user" },
    },
  },
  {
    type: "user/message",
    seq: 824,
    time: 1791938179739,
    data: {
      content: [{ type: "text", text: "(empty message)" }],
      source: { kind: "dsh-rewind" },
      role: "user",
      id: "6b05f62f-f478-45fb-8cb8-50dcda7759b7",
    },
    sourceEventSeqs: [802, 803],
    surfaceOp: { op: "replace", startSeq: 802, endSeq: 803 },
  },
  {
    type: "command/done",
    seq: 825,
    time: 1791938179740,
    data: {
      commandId: "cmd-8c119757-13",
      kind: "success",
      text: "Withdrawn seq 802 and everything after it (conversation returned to earlier).",
      sourceEventSeq: 824,
    },
  },
  {
    type: "user/message",
    seq: 830,
    time: 1791938231664,
    data: {
      content: [{ type: "text", text: "继续" }],
      source: {
        kind: "user",
        rpcId: "9a813c7f-1613-405b-a37e-57b25086b3ec",
        clientTimeZone: "Asia/Shanghai",
      },
      role: "user",
      id: "2c5e83ac-55cf-4a84-9daa-f25af2546614",
    },
    surfaceOp: "append",
  },
  {
    type: "command/run",
    seq: 850,
    time: 1791938272620,
    data: {
      commandId: "cmd-8c119757-18",
      name: "rewind",
      args: " preview @830 both",
      source: { kind: "user" },
    },
  },
  {
    type: "command/done",
    seq: 851,
    time: 1791938272691,
    data: {
      commandId: "cmd-8c119757-18",
      kind: "success",
      text: "Rewind to seq 830, removing 1 node(s) from the model context (conversation log kept).\nNo restorable changes after the target.\nimpact=0",
    },
  },
  {
    type: "command/run",
    seq: 852,
    time: 1791938273661,
    data: {
      commandId: "cmd-8c119757-19",
      name: "rewind",
      args: " @830 chat",
      source: { kind: "user" },
    },
  },
  {
    type: "user/message",
    seq: 853,
    time: 1791938273719,
    data: {
      content: [{ type: "text", text: "(empty message)" }],
      source: { kind: "dsh-rewind" },
      role: "user",
      id: "2ce7c1c6-0c54-451c-864c-7026fd5bb92d",
    },
    sourceEventSeqs: [830],
    surfaceOp: { op: "replace", startSeq: 830, endSeq: 830 },
  },
  {
    type: "command/done",
    seq: 854,
    time: 1791938273720,
    data: {
      commandId: "cmd-8c119757-19",
      kind: "success",
      text: "Withdrawn seq 830 and everything after it (conversation returned to earlier).",
      sourceEventSeq: 853,
    },
  },
] as const;

/** Project the real records the way the host's command definition does. */
function chatFromRealEvents(events: typeof REAL_REWIND_EVENTS): {
  order: readonly string[];
  nodes: { get(key: string): CutChatNode | undefined };
} {
  const nodes: CutChatNode[] = [];
  const started = new Map<
    string,
    { seq: number; time: number; name: string; args: string | null }
  >();
  for (const event of events) {
    const commandId = event.data.commandId;
    if (commandId === undefined) continue;
    if (event.type === "command/run") {
      started.set(commandId, {
        seq: event.seq,
        time: event.time,
        name: event.data.name ?? "",
        args: event.data.args ?? null,
      });
      nodes.push({
        key: `command:${commandId}`,
        kind: "command",
        anchorSeq: event.seq,
        visibility: "visible",
        data: {
          kind: "command",
          seq: event.seq,
          time: event.time,
          commandId,
          name: event.data.name,
          args: event.data.args ?? null,
          outcome: null,
        },
      });
      continue;
    }
    if (event.type === "command/done") {
      // `commandFromDone` keeps the RUN seq as the node's seq/anchorSeq.
      const previous = started.get(commandId);
      const marker =
        "sourceEventSeq" in event.data ? event.data.sourceEventSeq : undefined;
      nodes.push({
        key: `command:${commandId}`,
        kind: "command",
        anchorSeq: previous?.seq ?? event.seq,
        visibility: "visible",
        data: {
          kind: "command",
          seq: previous?.seq ?? event.seq,
          time: previous?.time ?? event.time,
          commandId,
          name: previous?.name ?? null,
          args: previous?.args ?? null,
          outcome: {
            kind: event.data.kind,
            ...(marker === undefined ? {} : { sourceEventSeq: marker }),
          },
        },
      });
      continue;
    }
    // Only an append surface event materialises as a chat node; the replace marker does not.
    if (event.surfaceOp === "append") {
      nodes.push({
        key: `user:${event.seq}`,
        kind: "user",
        anchorSeq: event.seq,
        visibility: "visible",
        data: { seq: event.seq, time: event.time, content: event.data.content },
      });
    }
  }
  return chatOf(nodes);
}

test("the genuine host records from a real session produce the expected two cuts", () => {
  const chat = chatFromRealEvents(REAL_REWIND_EVENTS);
  // rewind#1 withdrew 802; the later user message at 830 survived it; rewind#2
  // then withdrew 830 itself.
  assert.deepEqual(rewindCutSpans(chat), [
    { start: 802, end: 824 },
    { start: 830, end: 853 },
  ]);
  // Every row in this window is inside one of the two cuts.
  assert.deepEqual(visibleChatKeys(chat), []);
  // The preview commands (821, 850) are not executed rewinds: they contribute
  // no span of their own, and the two `command/done` successes with no marker
  // (822, 851) are not cut sources either.
  const previewOnly = chatFromRealEvents(
    REAL_REWIND_EVENTS.filter(
      (event) =>
        event.seq !== 823 &&
        event.seq !== 824 &&
        event.seq !== 825 &&
        event.seq !== 852 &&
        event.seq !== 853 &&
        event.seq !== 854,
    ) as typeof REAL_REWIND_EVENTS,
  );
  assert.deepEqual(rewindCutSpans(previewOnly), []);
  // The replace markers (824, 853) never materialise as chat nodes, but they are
  // the cuts' upper bounds — which is exactly what swallows the `/rewind` rows
  // anchored just before them.
  const cuts = rewindCutSpans(chat);
  assert.equal(cutContains(cuts, 824), true);
  assert.equal(cutContains(cuts, 853), true);
});

/**
 * The name the LIVE chat snapshot carries. The session log records
 * `command/run.name: "rewind"`, but the plugin registers its command as
 * `rewind-plugin` (`ENGINE_COMMANDS = new Set(["rewind-plugin", "rewind"])` in
 * dsh-rewind-plugin's `src/client/hidden.ts`), and that is what the client
 * projection publishes. Reading only the log spelling is the defect this test
 * pins: the cut silently computed to nothing on every real session.
 */
test("the command name the live snapshot publishes (rewind-plugin) still cuts", () => {
  const chat = chatOf([
    message("user-1", "user", 1),
    message("assistant-2", "assistant-step", 2),
    rewindCommand("command-3", 3, " @1 chat", 4),
  ]);
  assert.equal(
    (chat.nodes.get("command-3")?.data as { name?: string } | undefined)?.name,
    "rewind-plugin",
  );
  assert.deepEqual(rewindCutSpans(chat), [{ start: 1, end: 4 }]);
  assert.deepEqual(visibleChatKeys(chat), []);
  // The candidate probe and the impact preview carry the same engine name.
  const probes = chatOf([
    message("user-1", "user", 1),
    rewindCommand("preview-2", 2, " preview @1 both", undefined, "success"),
    rewindCommand("candidates-3", 3, "__candidates", undefined, "success"),
  ]);
  assert.deepEqual(visibleChatKeys(probes), ["user-1"]);
});

test("the pre-fix name predicate reproduces the reported defect", () => {
  // Regression evidence, not a wish: matching only the log spelling
  // (`name === 'rewind'`) finds no cut source in a live snapshot, so every
  // withdrawn row survives and the command is merely recorded.
  const chat = chatOf([
    message("user-1", "user", 1),
    message("assistant-2", "assistant-step", 2),
    rewindCommand("command-3", 3, " @1 chat", 4),
  ]);
  const legacyCutSpans = (c: {
    order: readonly string[];
    nodes: { get(key: string): CutChatNode | undefined };
  }) =>
    c.order.flatMap((key) => {
      const node = c.nodes.get(key);
      const data = node?.data as
        | {
            name?: string;
            args?: unknown;
            outcome?: { kind?: string; sourceEventSeq?: number };
          }
        | undefined;
      if (node?.kind !== "command" || data?.name !== "rewind") return [];
      if (data.outcome?.kind !== "success") return [];
      const marker = data.outcome.sourceEventSeq;
      const match =
        typeof data.args === "string" ? data.args.match(/@(\d+)/) : null;
      return marker === undefined || match === null
        ? []
        : [{ start: Number(match[1]), end: marker }];
    });
  assert.deepEqual(legacyCutSpans(chat), []);
  assert.notDeepEqual(legacyCutSpans(chat), rewindCutSpans(chat));
});

test("fractional synthetic anchors inside a cut are withdrawn", () => {
  // The live snapshot anchors the turn's process disclosure at
  // `controlAnchorSeq - 0.1` and the turn tail at `seq + 0.1`
  // (`CHAT_SYNTHETIC_SEQ_OFFSETS`). An integer-only comparison lets the last
  // synthetic row of a withdrawn turn survive on its own, which is exactly what
  // the smoke test showed: the user bubble and every tool row vanished, and one
  // lone process cell stayed behind.
  const chat = chatOf([
    message("user-1", "user", 1),
    {
      key: "process-9",
      kind: "turn-process",
      anchorSeq: 9.9,
      visibility: "visible",
      data: { turn: 1, controlAnchorSeq: 10 },
    },
    message("assistant-10", "assistant-step", 10),
    rewindCommand("command-11", 11, " @1 chat", 12),
  ]);
  assert.deepEqual(rewindCutSpans(chat), [{ start: 1, end: 12 }]);
  assert.equal(cutContains(rewindCutSpans(chat), 9.9), true);
  assert.deepEqual(visibleChatKeys(chat), []);
  // `anchorSeqOf` reports the render position, fractional included: it is the
  // range check's input, not an identity check.
  assert.equal(
    anchorSeqOf({ key: "p", kind: "turn-process", anchorSeq: 9.9 }),
    9.9,
  );
  assert.equal(
    anchorSeqOf({ key: "p", kind: "turn-process", anchorSeq: -1 }),
    undefined,
  );
  assert.equal(anchorSeqOf({ key: "p", kind: "user", data: { seq: 7 } }), 7);
});

test("a fractional anchor before the cut start is not swept in", () => {
  const chat = chatOf([
    message("user-1", "user", 1),
    {
      key: "tail-0",
      kind: "turn-tail",
      anchorSeq: 0.1,
      visibility: "visible",
      data: { seq: 0 },
    },
    message("assistant-2", "assistant-step", 2),
    rewindCommand("command-3", 3, " @2 chat", 4),
  ]);
  assert.deepEqual(rewindCutSpans(chat), [{ start: 2, end: 4 }]);
  assert.deepEqual(visibleChatKeys(chat), ["user-1", "tail-0"]);
});

test('a withdrawn turn folds away instead of vanishing in one frame', () => {
  // The third reported symptom: the rows were removed from the visible order and
  // unmounted in the same commit, so nothing scrolled and the transcript snapped.
  // The reader now renders every turn through a retiring lane that keeps a
  // departing turn mounted until its collapse settles.
  const motion = readFileSync(resolve(root, 'src/client/motion.tsx'), 'utf8');
  assert.ok(motion.includes('export function RetiringTurns'));
  // The lane must be able to release a slot when the collapse ends, otherwise a
  // departing turn would stay mounted forever at zero height.
  assert.ok(motion.includes('onRetired?: () => void'));
  assert.ok(motion.includes('retired.current?.()'));
  const reader = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  assert.ok(reader.includes('<RetiringTurns'));
  assert.ok(reader.includes('RetiringTurns,'));
  // The map was the seam that unmounted turns outright.
  assert.ok(!reader.includes('{groups.map((group) => ('));
});

test('the collapsing lane keeps the between-turns margin it dislodged', () => {
  // Wrapping a turn adds a level of nesting, which breaks the sibling selector
  // `.turn + .turn`. The margin has to be re-expressed one level in or every
  // turn loses its 12px separation.
  const css = readFileSync(resolve(root, 'src/client/Reader.module.css'), 'utf8');
  assert.ok(css.includes('.retiringContent + .retiringContent > .turn { margin-top: 12px; }'));
});
