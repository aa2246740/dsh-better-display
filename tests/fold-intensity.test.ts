import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  FOLD_INTENSITY_DEFAULT,
  autoFoldFromIntensity,
  foldIntensityOf,
  frostedGlassOf,
  processOnlyFromIntensity,
} from '../src/client/fold-intensity.ts';
import { presentLiveTurn } from '../src/client/live-turn.ts';
import type { LiveStep } from '../src/client/live-turn.ts';
import { en, zh } from '../src/client/settings-copy.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const reasoning = (n: number): LiveStep => ({ kind: 'reasoning', key: `r${n}`, nodeKey: `n${n}`, start: 0, blocks: [], step: n });
const body: LiveStep = { kind: 'body', key: 'b1', nodeKey: 'n1', start: 1, blocks: [{ kind: 'text', text: 'answer' }], step: 1 };
const tool: LiveStep = {
  kind: 'tool',
  key: 't1',
  entry: {
    kind: 'tool',
    key: 't1',
    callId: 'c1',
    step: 0,
    order: 0,
    draft: { kind: 'tool-call', callId: 'c1', name: 'read', argsRaw: '{"path":"Reader.tsx"}' },
  },
};
const open = { status: 'open' } as const;
const closed = { status: 'closed', reason: 'completed', latestStep: 2, closingStep: 2 } as const;

test('fold intensity defaults to standard (1) and glass defaults off', () => {
  assert.equal(FOLD_INTENSITY_DEFAULT, 1);
  assert.equal(foldIntensityOf(undefined), 1);
  assert.equal(foldIntensityOf({}), 1);
  assert.equal(frostedGlassOf(undefined), false);
  assert.equal(frostedGlassOf({}), false);
  assert.equal(frostedGlassOf({ frostedGlass: false }), false);
  assert.equal(frostedGlassOf({ frostedGlass: true }), true);
});

test('fold slider maps 0/1/2 and migrates older persist flags', () => {
  assert.equal(foldIntensityOf({ foldIntensity: 0 }), 0);
  assert.equal(foldIntensityOf({ foldIntensity: 1 }), 1);
  assert.equal(foldIntensityOf({ foldIntensity: 2 }), 2);
  assert.equal(foldIntensityOf({ autoFold: false }), 0);
  assert.equal(foldIntensityOf({ processOnly: true }), 2);
  assert.equal(foldIntensityOf({ autoFold: true, processOnly: false }), 1);
  assert.equal(autoFoldFromIntensity(0), false);
  assert.equal(autoFoldFromIntensity(1), true);
  assert.equal(autoFoldFromIntensity(2), true);
  assert.equal(processOnlyFromIntensity(0), false);
  assert.equal(processOnlyFromIntensity(1), false);
  assert.equal(processOnlyFromIntensity(2), true);
});

test('autoFold false keeps every step open; autoFold true folds only thinking/tool runs', () => {
  const steps = [reasoning(1), body, tool, reasoning(2)];
  const none = presentLiveTurn(steps, open, false);
  assert.equal(none.some(item => item.kind === 'fold'), false);
  assert.deepEqual(none.map(item => item.key), ['r1', 'b1', 't1', 'r2']);

  // Narration stays open; each prior reasoning/tool run folds in its own place.
  const standard = presentLiveTurn(steps, open, true);
  assert.deepEqual(standard.map(item => item.kind), ['fold', 'open', 'fold', 'open']);
  assert.deepEqual(standard.filter(item => item.kind === 'open').map(item => item.key), ['b1', 'r2']);
  const folds = standard.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 2);
  if (folds[0]?.kind !== 'fold' || folds[1]?.kind !== 'fold') throw new Error('expected standard folds');
  assert.deepEqual(folds[0].steps.map(step => step.key), ['r1']);
  assert.deepEqual(folds[1].steps.map(step => step.key), ['t1']);
  assert.equal(standard.some(item => item.kind === 'fold' && item.steps.some(step => step.kind === 'body')), false);
});

test('root reader store persists glass off and standard fold on dsh.reader.v1', () => {
  const store = readFileSync(resolve(root, 'src/client/store.ts'), 'utf8');
  assert.match(store, /persist:\s*'dsh\.reader\.v1'/);
  assert.match(store, /frostedGlass:\s*false/);
  assert.match(store, /foldIntensity:\s*FOLD_INTENSITY_DEFAULT/);
  assert.match(store, /deliverableOpenMode:\s*'external'/);
  assert.match(store, /setFrostedGlass/);
  assert.match(store, /setFoldIntensity/);
  assert.match(store, /setDeliverableOpenMode/);
});

test('settings copy names fold switch and glass without leaking home paths', () => {
  for (const copy of [en, zh]) {
    assert.match(copy.glassTitle, /毛玻璃|Frosted glass/i);
    assert.match(copy.foldTitle, /折叠|fold/i);
    assert.doesNotMatch(Object.values(copy).join('\n'), /\/Users\/|\$HOME\b/);
  }
  const reader = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  assert.match(reader, /data-reader-glass=\{frostedGlass/);
  assert.match(reader, /data-reader-auto-fold=\{autoFold/);
  assert.doesNotMatch(reader, /setProcessOnly/);
});
