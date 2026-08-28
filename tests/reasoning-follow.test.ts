import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reasoningTarget } from '../src/client/reasoning-follow.js';

test('reasoning follows ordinary growth in two-line steps without passing the tail', () => {
  assert.equal(reasoningTarget(0, 284, 224, 24), 48);
  assert.equal(reasoningTarget(48, 284, 224, 24), 60);
  assert.equal(reasoningTarget(0, 100, 224, 24), 0);
  assert.equal(reasoningTarget(999, 284, 224, 24), 60);
});

test('a large reasoning burst still advances exactly two lines without skipping the middle', () => {
  let top = 0;
  for (const content of [400, 1200, 1500, 1500]) {
    const target = reasoningTarget(top, content, 224, 24);
    assert.equal(target - top, 48, 'a transport burst must not change the reference step distance');
    assert.ok(target <= content - 224);
    top = target;
  }
  while (top < 1500 - 224) {
    const target = reasoningTarget(top, 1500, 224, 24);
    assert.ok(target > top && target - top <= 48);
    top = target;
  }
  assert.equal(top, 1500 - 224);
  assert.equal(reasoningTarget(top, 1500, 224, 24), top, 'reaching the end must not replay the transcript');
});

test('two-line movement follows actual typography and clamps a resized viewport', () => {
  assert.equal(reasoningTarget(28, 900, 192, 30), 88);
  assert.equal(reasoningTarget(-50, 900, 192, 30), 60);
  assert.equal(reasoningTarget(708, 900, 400, 30), 500);
  assert.equal(reasoningTarget(0, 900, 192, 0), 2);
});
