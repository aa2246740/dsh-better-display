import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeTimelineItems } from '../src/client/timeline.ts';

test('mergeTimelineItems handles empty inputs gracefully', () => {
  assert.deepEqual(mergeTimelineItems([], undefined), []);
  assert.deepEqual(mergeTimelineItems([], []), []);
  assert.deepEqual(mergeTimelineItems(undefined, null), []);
});

test('mergeTimelineItems parses and normalizes wire turn outline entries', () => {
  const outline = [
    { turn: 1, seq: 10, prompt: 'Hello world', response: 'Hi there' },
    { turn: 2, seq: 25, prompt: 'Fix the bug', response: 'Fixed' },
    { turn: 'invalid', seq: 30 }, // should be ignored
    null,
    { turn: 0, seq: 1, prompt: '', response: '' },
  ];

  const items = mergeTimelineItems([], outline);
  assert.equal(items.length, 3);
  assert.equal(items[0].turn, 0);
  assert.equal(items[1].turn, 1);
  assert.equal(items[1].prompt, 'Hello world');
  assert.equal(items[1].anchor.kind, 'unloaded');
  if (items[1].anchor.kind === 'unloaded') {
    assert.equal(items[1].anchor.seq, 10);
  }
  assert.equal(items[2].turn, 2);
});

test('mergeTimelineItems prioritizes loaded anchors and preserves deliverable flags', () => {
  const outline = [
    { turn: 1, seq: 10, prompt: 'Outline prompt', response: 'Outline reply' },
    { turn: 2, seq: 20, prompt: 'Turn 2 prompt', response: '' },
  ];

  const loaded = [
    { turn: 1, anchorKey: 'node-turn-1', prompt: 'Loaded prompt 1', response: 'Loaded reply 1' },
  ];

  const deliverables = new Set([1]);
  const items = mergeTimelineItems(loaded, outline, deliverables);

  assert.equal(items.length, 2);
  // Turn 1 should be loaded anchor with freshest prompt & hasDeliverables = true
  assert.equal(items[0].turn, 1);
  assert.equal(items[0].anchor.kind, 'loaded');
  if (items[0].anchor.kind === 'loaded') {
    assert.equal(items[0].anchor.key, 'node-turn-1');
  }
  assert.equal(items[0].prompt, 'Loaded prompt 1');
  assert.equal(items[0].hasDeliverables, true);

  // Turn 2 is still unloaded
  assert.equal(items[1].turn, 2);
  assert.equal(items[1].anchor.kind, 'unloaded');
  assert.equal(items[1].hasDeliverables, false);
});
