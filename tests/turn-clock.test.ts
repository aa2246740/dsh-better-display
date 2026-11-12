import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  elapsedParts,
  formatTurnWindow,
  formatWallClock,
  pinnedInDock,
  rowVisible,
  turnDuration,
  turnPhase,
  untilNextSecond,
  wallClockParts
} from '../src/client/turn-clock.js';

/**
 * The pure formatting behind the turn clock row. These assertions carry the
 * wording the reader asked for, so a future edit cannot silently reword it.
 */

test('the wall clock renders zero-padded local fields', () => {
  const time = new Date(2026, 10, 12, 9, 5, 3).getTime();
  assert.deepEqual(wallClockParts(time), { hour: '09', minute: '05', second: '03' });
  assert.equal(formatWallClock(time), '09:05:03');
});

test('elapsed time drops the minute under a minute and pads past it', () => {
  // Under a minute reads `19秒`, not `0分19秒` — the padded zero was the earlier
  // wording and it read as noise.
  assert.deepEqual(elapsedParts(19_000), { minutes: null, seconds: '19' });
  assert.deepEqual(elapsedParts(0), { minutes: null, seconds: '0' });
  // Past a minute the seconds pad, so the digits do not jump around a tick.
  assert.deepEqual(elapsedParts(60_000), { minutes: 1, seconds: '00' });
  assert.deepEqual(elapsedParts(188_000), { minutes: 3, seconds: '08' });
  assert.deepEqual(elapsedParts(675_000), { minutes: 11, seconds: '15' });
});

test('elapsed time clamps a negative span instead of counting backwards', () => {
  assert.deepEqual(elapsedParts(-5_000), { minutes: null, seconds: '0' });
});

test('a closed turn is done; anything else still runs', () => {
  assert.equal(turnPhase('closed'), 'done');
  assert.equal(turnPhase('open'), 'running');
  // No turn yet: the reader keeps the running phase for its echo window.
  assert.equal(turnPhase(undefined), 'running');
});

test('the row stays visible for a whole turn, including after it closes', () => {
  assert.equal(rowVisible(undefined, true), true);
  assert.equal(rowVisible('open', false), true);
  // The finished row is a record of the turn, so it must not vanish.
  assert.equal(rowVisible('closed', false), true);
  assert.equal(rowVisible(undefined, false), false);
});

test('only a running turn is pinned into the composer dock', () => {
  assert.equal(pinnedInDock(true, 'running'), true);
  assert.equal(pinnedInDock(true, 'done'), false);
  assert.equal(pinnedInDock(false, 'running'), false);
});

test('the done row prints its window with an en dash', () => {
  const start = new Date(2026, 10, 12, 14, 1, 41).getTime();
  const end = new Date(2026, 10, 12, 14, 12, 56).getTime();
  assert.equal(formatTurnWindow(start, end), '14:01:41 – 14:12:56');
  assert.equal(turnDuration(start, end), 675_000);
});

test('a skewed turn pair never reports negative duration', () => {
  assert.equal(turnDuration(2_000, 1_000), 0);
});

test('the tick delay lands on the next whole second', () => {
  assert.equal(untilNextSecond(1_000), 1_000);
  assert.equal(untilNextSecond(1_250), 750);
  assert.equal(untilNextSecond(1_999), 1);
  // A negative epoch normalises into (0, 1000] rather than looping or throwing.
  assert.equal(untilNextSecond(-250), 250);
});
