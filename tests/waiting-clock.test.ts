import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { awaitingModel, HANDOVER_KINDS, handsBackToModel, WAIT_AFTER, waitingAnchor } from '../src/client/waiting-clock.js';

const nodes = new Map<string, { kind: string; data: unknown }>([
  ['u1', { kind: 'user', data: { time: 1000 } }],
  ['s1', { kind: 'steering', data: { time: 301000 } }],
  ['s2', { kind: 'steering', data: { time: 305000 } }],
  ['a1', { kind: 'assistant-step', data: { time: 302000 } }],
  ['ctx', { kind: 'context', data: { time: 399000 } }],
  // A settled tool: the root carries its result, so control returns to the model.
  ['tr', { kind: 'tool-call', data: { time: 61000, root: { kind: 'tool-result', callId: 'c1' } } }],
  // A running tool: no result yet, so the tool — not the model — is working.
  ['tc', { kind: 'tool-call', data: { time: 62000, root: { callId: 'c2', name: 'read', argsRaw: '{}' } } }],
  // A command that already reported an outcome.
  ['cmd', { kind: 'command', data: { time: 70000, outcome: { kind: 'success' } } }],
  // A command that has not settled yet.
  ['cmd-open', { kind: 'command', data: { time: 71000, outcome: null } }],
]);
const get = (key: string) => nodes.get(key);

// The regression this guards: the handover set is matched against the CHAT layer's
// kind union, because that is what `snapshot.nodes` holds. A conversation-layer name
// ('tool-result') or an invented one ('tool-return') never occurs there, so the branch
// it guards is silently dead — which is how a returned tool stopped restarting the wait.
test('handover kinds are chat-layer kinds, verified against the host type', () => {
  // The compile-time check lives in the `satisfies` in waiting-clock; this is the
  // runtime echo so a cast cannot quietly defeat it.
  for (const kind of HANDOVER_KINDS) {
    assert.ok(WAIT_AFTER.has(kind) || kind === 'user' || kind === 'steering' || kind === 'tool-call' || kind === 'command', kind);
  }
});

test('the conversation-layer name for a returned tool is NOT a chat kind', () => {
  // 'tool-result' is real in the conversation contract, but the reader never sees a
  // node with that kind: it is nested inside tool-call data. Keeping it in the set
  // was the bug, so pin its absence.
  assert.ok(!WAIT_AFTER.has('tool-result' as never), 'tool-result is not a chat node kind');
  assert.ok(!WAIT_AFTER.has('tool-return' as never), 'tool-return was never a kind at all');
  assert.ok(!WAIT_AFTER.has('command-input' as never), 'command-input is not a chat node kind');
});

test('a returned tool hands control back to the model', () => {
  const node = get('tr')!;
  assert.ok(handsBackToModel(node, true));
  assert.deepEqual(waitingAnchor(['u1', 's1', 'tr'], get, [], true), { key: 'tr', time: 61000 });
});

test('a running tool does NOT hand control back — the tool is the one working', () => {
  assert.ok(!handsBackToModel(get('tc')!, true));
  // Falling back to the user's message: the wait keeps its earlier clock.
  assert.deepEqual(waitingAnchor(['u1', 'tc'], get, [], true), { key: 'u1', time: 1000 });
});

test('a settled command hands over only while the session runs; one still executing never does', () => {
  // Running: the command started a turn and the model owes the next move.
  assert.ok(handsBackToModel(get('cmd')!, true));
  assert.deepEqual(waitingAnchor(['u1', 'cmd'], get, [], true), { key: 'cmd', time: 70000 });
  // Idle: a UI-only command (/preset) settled and nobody will answer it (#86).
  assert.ok(!handsBackToModel(get('cmd')!, false));
  assert.deepEqual(waitingAnchor(['u1', 'cmd'], get, [], false), { key: 'u1', time: 1000 });
  for (const running of [true, false]) {
    assert.ok(!handsBackToModel(get('cmd-open')!, running));
    assert.deepEqual(waitingAnchor(['u1', 'cmd-open'], get, [], running), { key: 'u1', time: 1000 });
  }
});

test('the running bit only gates commands', () => {
  for (const key of ['u1', 's1', 'ctx', 'tr']) assert.ok(handsBackToModel(get(key)!, false), key);
  assert.ok(!handsBackToModel(get('tc')!, true));
});

test('ordinary waiting starts at user input', () => assert.deepEqual(waitingAnchor(['u1'], get, [], true), { key: 'u1', time: 1000 }));
test('steering resets a five-minute-old turn to the new input', () => assert.deepEqual(waitingAnchor(['u1', 's1'], get, [], true), { key: 's1', time: 301000 }));
test('repeated steering resets even while the waiting indicator stays mounted', () => assert.deepEqual(waitingAnchor(['u1', 's1', 's2'], get, [], true), { key: 's2', time: 305000 }));

// An assistant-step mid-turn is not a handover, so the wait keeps its earlier clock.
test('an assistant step does not reset waiting', () => assert.deepEqual(waitingAnchor(['u1', 's1', 'a1'], get, [], true), { key: 's1', time: 301000 }));

// Context injection IS a handover: the model owes the next move from that moment,
// and the clock must not keep counting the minutes spent before it.
test('context injection restarts the wait', () => assert.deepEqual(waitingAnchor(['u1', 's1', 'a1', 'ctx'], get, [], true), { key: 'ctx', time: 399000 }));

test('local echo resets immediately before steering admission', () => assert.deepEqual(waitingAnchor(['u1'], get, [{ requestId: 'new', time: 301000, placement: 'next-step' }], true), { key: 'pending:new', time: 301000 }));

test('queued future turns and stale echoes cannot reset current waiting', () => {
  assert.deepEqual(waitingAnchor(['u1', 's1'], get, [{ requestId: 'q', time: 400000, placement: 'queued' }], true), { key: 's1', time: 301000 });
  assert.deepEqual(waitingAnchor(['u1', 's1'], get, [{ requestId: 'old', time: 1000 }], true), { key: 's1', time: 301000 });
});

test('missing latest timestamp falls back to a new-input clock, not old history', () => {
  assert.deepEqual(waitingAnchor(['u1', 'bad'], key => key === 'bad' ? { kind: 'steering', data: {} } : get(key), [], true), { key: 'bad', time: null });
  assert.deepEqual(waitingAnchor([], get, [], true), { key: 'unresolved', time: null });
});

// #86. Shapes as the chat snapshot carries them: a closed turn, then a
// command row with no turn (command/run + command/done open none).
const turnRows = new Map<string, { kind: string; data: unknown }>([
  ['user', { kind: 'user', data: { time: 1000 } }],
  ['answer', { kind: 'assistant-step', data: { time: 2000, status: 'settled', blocks: [{ kind: 'text', text: 'done' }] } }],
  ['preset', { kind: 'command', data: { time: 9000, name: 'preset', args: ' ptc', outcome: { kind: 'success', text: 'switched to ptc' } } }],
  ['preset-open', { kind: 'command', data: { time: 9000, name: 'preset', outcome: null } }],
]);
const rows = (keys: string[]) => ({ order: keys, get: (key: string) => turnRows.get(key) });

test('a UI-only command after a closed turn leaves no wait, live or after reload', () => {
  // Live: command/done arrived, the host never reported running.
  assert.equal(awaitingModel({ running: false, pending: [], ...rows(['user', 'answer', 'preset']), lastTurnStatus: undefined }), false);
  // Reload: the persisted log replays the same rows, the session opens idle.
  assert.equal(awaitingModel({ running: false, pending: [], ...rows(['user', 'answer', 'preset']), lastTurnStatus: undefined }), false);
});

test('a command that starts a turn shows the wait until the model answers', () => {
  // command/done, then the running bit: the model is about to answer.
  assert.equal(awaitingModel({ running: true, pending: [], ...rows(['user', 'answer', 'preset']), lastTurnStatus: undefined }), true);
  // The first assistant row with content ends the wait.
  turnRows.set('next', { kind: 'assistant-step', data: { time: 9500, status: 'running', blocks: [{ kind: 'reasoning', text: '…' }] } });
  assert.equal(awaitingModel({ running: true, pending: [], ...rows(['user', 'answer', 'preset', 'next']), lastTurnStatus: 'open' }), false);
});

test('a command still executing is not a wait, running or not', () => {
  for (const running of [true, false]) {
    assert.equal(awaitingModel({ running, pending: [], ...rows(['user', 'answer', 'preset-open']), lastTurnStatus: undefined }), false);
  }
});

test('sending after the command still shows the wait at once', () => {
  const pending = [{ requestId: 'r1', time: 10000, placement: 'transcript' }];
  assert.equal(awaitingModel({ running: false, pending, ...rows(['user', 'answer', 'preset']), lastTurnStatus: undefined }), true);
});

test('user input in an open turn keeps the existing wait rules', () => {
  assert.equal(awaitingModel({ running: true, pending: [], ...rows(['user']), lastTurnStatus: 'open' }), true);
  assert.equal(awaitingModel({ running: false, pending: [], ...rows(['user']), lastTurnStatus: 'open' }), true);
  assert.equal(awaitingModel({ running: false, pending: [], ...rows(['user']), lastTurnStatus: 'closed' }), false);
  assert.equal(awaitingModel({ running: false, pending: [], ...rows([]), lastTurnStatus: undefined }), false);
});

test('the Reader decides the wait and its clock with the running bit', () => {
  const reader = readFileSync(resolve(import.meta.dirname, '../src/client/Reader.tsx'), 'utf8');
  assert.match(reader, /awaitingModel\(\{\s*running: running === true,/);
  assert.match(reader, /waitingAnchor\(renderKeys, key => nodes\.get\(key\), pendingList, running === true\)/);
  assert.doesNotMatch(reader, /handsBackToModel\(/);
});
