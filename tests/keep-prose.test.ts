/**
 * The two opt-in fold switches (issue #19).
 *
 * `keepProse` answers "may the model's user-facing text be folded away?" — a
 * different question from `foldIntensity`, which only decides how much process
 * to fold. `keepToolSemantics` names the tools a digest contains instead of
 * counting them.
 *
 * Both are opt-in: with them off every assertion below must match the behaviour
 * main already shipped, because the author rejected PR #31 precisely for moving
 * the default.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keepProseOf, keepToolSemanticsOf } from '../src/client/fold-intensity.ts';
import {
  foldSummary,
  foldToolSemantics,
  presentLiveTurn,
  settledFoldItems,
  splitChainKeepingBody,
} from '../src/client/live-turn.ts';
import type { LiveStep } from '../src/client/live-turn.ts';
import type { TurnBoundary } from '../src/client/projection.ts';

const open: TurnBoundary = { status: 'open', reason: null, latestStep: 4, closingStep: null };
const completed: TurnBoundary = { status: 'closed', reason: 'completed', latestStep: 4, closingStep: 4 };

function reasoning(id: string, text = `思考 ${id}`): LiveStep {
  return { kind: 'reasoning', key: id, nodeKey: id, start: 0, blocks: [{ kind: 'reasoning', text }], step: Number(id.replace(/\D/g, '') || 0) };
}

function body(id: string, text = `输出 ${id}`): LiveStep {
  return { kind: 'body', key: id, nodeKey: id, start: 1, blocks: [{ kind: 'text', text }], step: 0 };
}

function tool(id: string, name = 'read', path = 'src/client/Reader.tsx'): LiveStep {
  return {
    kind: 'tool',
    key: id,
    entry: {
      kind: 'tool', key: id, callId: id, step: 0, order: 0,
      draft: { kind: 'tool-call', callId: id, name, argsRaw: JSON.stringify(name === 'bash' ? { command: 'pnpm test' } : { path }) },
    },
  };
}

/** Keys of every step that is still visible (inside no fold). */
function openStepKeys(items: ReturnType<typeof presentLiveTurn>): string[] {
  return items.flatMap(item => item.kind === 'open' ? [item.step.key] : []);
}

function foldKeys(items: ReturnType<typeof presentLiveTurn>): string[] {
  return items.flatMap(item => item.kind === 'fold' ? item.steps.map(step => step.key) : []);
}

test('the switches default off, so main behaviour is unchanged for anyone who does not ask', () => {
  for (const state of [undefined, null, {}, { keepProse: false }, { keepProse: 'yes' }, { keepProse: 1 }]) {
    assert.equal(keepProseOf(state), false, `keepProseOf(${JSON.stringify(state)})`);
  }
  for (const state of [undefined, null, {}, { keepToolSemantics: false }, { keepToolSemantics: 1 }]) {
    assert.equal(keepToolSemanticsOf(state), false, `keepToolSemanticsOf(${JSON.stringify(state)})`);
  }
  assert.equal(keepProseOf({ keepProse: true }), true);
  assert.equal(keepToolSemanticsOf({ keepToolSemantics: true }), true);
});

test('with both switches off the original single-run split stays in charge', () => {
  const steps = [reasoning('1'), body('2'), tool('3'), reasoning('4')];
  const items = presentLiveTurn(steps, open);
  assert.deepEqual(foldKeys(items), ['1', '2', '3']);
  assert.deepEqual(openStepKeys(items), ['4']);
});

test('keepProse leaves a lone thought box visible instead of folding it into a count', () => {
  const segments = splitChainKeepingBody([reasoning('1')]);
  assert.equal(segments.length, 1);
  assert.equal(segments[0]?.fold, null);
  assert.deepEqual(segments[0]?.open.map(step => step.key), ['1']);
});

test('keepProse keeps every body step open and folds the finished process runs around it', () => {
  const steps = [reasoning('1'), tool('2'), body('3'), reasoning('4'), tool('5')];
  const items = presentLiveTurn(steps, open, true, true, false);
  // The answer text is never inside a digest.
  assert.equal(foldKeys(items).includes('3'), false);
  assert.equal(openStepKeys(items).includes('3'), true);
  // The run that finished before the answer is folded; the trailing run is still
  // streaming, so it stays open until the turn seals.
  assert.deepEqual(foldKeys(items), ['1', '2']);
  assert.deepEqual(openStepKeys(items), ['3', '4', '5']);
});

test('keepProse never folds a lone tool row, because that row already names itself', () => {
  const steps = [tool('1'), body('2')];
  const items = presentLiveTurn(steps, open, true, true, false);
  assert.deepEqual(foldKeys(items), []);
  assert.deepEqual(openStepKeys(items), ['1', '2']);
});

test('sealing a finished turn lets the trailing run fold, but still never the prose', () => {
  const steps = [reasoning('1'), tool('2'), body('3')];
  const live = presentLiveTurn(steps, open, true, true, false);
  assert.deepEqual(foldKeys(live), ['1', '2']);
  const sealed = presentLiveTurn(steps, open, true, true, false, true);
  assert.deepEqual(foldKeys(sealed), ['1', '2']);
  assert.equal(openStepKeys(sealed).includes('3'), true);
});

test('keepToolSemantics names the tools a digest hides instead of only counting them', () => {
  const folded = [tool('1', 'read', 'src/client/Reader.tsx'), tool('2', 'bash')];
  const named = foldToolSemantics(folded);
  assert.match(named, /读取/);
  assert.match(named, /Reader\.tsx/);
  assert.match(named, /运行命令|pnpm test/);
  // Counting stays available and unchanged for the default path.
  assert.equal(foldSummary(folded), '工具×2');
});

test('a digest carrying tool names is bounded, so the row stays one line', () => {
  const many = Array.from({ length: 9 }, (_, index) => tool(`t${index}`, 'read', `src/file-${index}.ts`));
  const named = foldToolSemantics(many);
  assert.match(named, /等 9 项$/);
  assert.ok(named.length < 200, `digest grew to ${named.length} chars`);
});

test('keepToolSemantics routes the live split through the per-run splitter and marks the digest', () => {
  const steps = [reasoning('1'), tool('2'), reasoning('3')];
  const items = presentLiveTurn(steps, open, true, false, true);
  const folds = items.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 1);
  if (folds[0]?.kind !== 'fold') throw new Error('missing digest');
  assert.equal(folds[0].named, true);
  assert.match(folds[0].summary, /读取/);
});

test('a finished turn honours the switches instead of collapsing into one whole-turn row', () => {
  const steps = [reasoning('1'), tool('2'), body('3')];
  // Turning either switch on must segment the settled turn too.
  const kept = settledFoldItems(steps, completed, true, false);
  assert.notEqual(kept, null);
  assert.equal(foldKeys(kept!).includes('3'), false);
  // Nothing asked for: fall through to the existing closed-turn path.
  assert.equal(settledFoldItems(steps, completed, false, false), null);
  // Still running: the live path owns it, not this one.
  assert.equal(settledFoldItems(steps, open, true, false), null);
});
