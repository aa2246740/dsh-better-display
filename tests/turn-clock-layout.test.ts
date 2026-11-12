import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { IDLE_CLOCK, createClockLane } from '../src/client/turn-clock-lane.js';

/**
 * Placement facts for the turn clock row, asserted against sources rather than a
 * browser: this package ships no DOM renderer and the claims below are static.
 *
 * The reported defect was the running row *shaking* while the transcript
 * scrolled. It used to be `position: sticky` inside the scrolling column, which
 * is re-laid-out on every scroll frame. It now mounts exactly like the built-in
 * 任务 row: a `conversation.input.dock` registration rendered inside
 * `[data-composer-seat]`, which the Host positions over the scrollport.
 */
const css = readFileSync(resolve(import.meta.dirname, '../src/client/Reader.module.css'), 'utf8');
const reader = readFileSync(resolve(import.meta.dirname, '../src/client/Reader.tsx'), 'utf8');
const entry = readFileSync(resolve(import.meta.dirname, '../src/client/entry.tsx'), 'utf8');
const clock = readFileSync(resolve(import.meta.dirname, '../src/client/TurnClock.tsx'), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css);
  assert.ok(match, `expected a rule for ${selector}`);
  return match[1]!;
}

test('the running row mounts in the same dock as 任务, one band below it', () => {
  // Read the registration by its id, not by surrounding formatting: Prettier is
  // free to re-wrap the call.
  const from = entry.indexOf("id: 'dsh-better-display-turn-clock'");
  assert.ok(from >= 0, 'registers the row into conversation.input.dock');
  const registration = entry.slice(from, from + 400);
  const order = /order:\s*(-?\d+),/u.exec(registration)?.[1];
  assert.ok(order !== undefined, 'the registration declares an order');
  // 任务 uses 0, the queue dock uses 20. Below the task card, above the input.
  assert.ok(Number(order) > 0, `the clock must sort below the 任务 row, got ${order}`);
  assert.ok(Number(order) < 20, `the clock must sort above the queue dock (20), got ${order}`);
  // `locale` is what gives a dock entry its `t`, and the Host's own dock passes it.
  assert.match(registration, /locale: 'chat'/u);
  // Both rows live in the same slot, which is what puts them in one stack.
  assert.match(entry, /name: 'conversation\.input\.dock',\s*id: 'dsh-better-display-turn-clock'/u);
});

test('the pinned row neither positions itself nor paints a plate', () => {
  const pin = rule('.turnClockPin');
  // The Host already places [data-composer-seat]; positioning here is what
  // reintroduces per-scroll-frame layout.
  assert.doesNotMatch(pin, /position:/u);
  // A plate would read as a second card stacked on the 任务 card.
  assert.doesNotMatch(pin, /background(?!-clip)/u);
  assert.doesNotMatch(pin, /box-shadow/u);
  assert.doesNotMatch(pin, /border-radius/u);
  assert.doesNotMatch(pin, /backdrop-filter/u);
});

test('the pinned row keeps the same 6px above and below', () => {
  // The composer stack already puts the same `--dsh-composer-stack-gap` above
  // (to the 任务 card) and below (to the input card), so any vertical padding
  // here would double one side's share. Zero vertical padding leaves exactly
  // that gap on both sides — measured: 6px above, 6px below.
  assert.match(rule('.turnClockPin .turnStatus'), /margin:\s*0/u);
  assert.doesNotMatch(rule('.turnClockPin'), /margin-bottom/u);
  assert.match(rule('.turnClockPin'), /padding:\s*0 12px/u);
});

test('the pinned row centres on the input card', () => {
  assert.match(rule('.turnClockPin'), /align-items:\s*center/u);
  // The row inside is shrink-to-fit, or centring would have nothing to centre.
  assert.match(rule('.turnClockPin .turnStatus'), /align-self:\s*center/u);
  // It spans the composer card width, which is what puts it over the input.
  assert.match(rule('.turnClockPin'), /--dsh-composer-card-max-width/u);
});

test('the finished row stays in the transcript flow', () => {
  // It belongs to that turn's text, so it scrolls away with the answer.
  assert.doesNotMatch(rule('.turnClockDock'), /position:\s*(sticky|absolute|fixed)/u);
  assert.match(reader, /clockInTranscript && <div className=\{css\.turnClockDock\}/u);
  assert.match(reader, /const clockInTranscript = clockVisible && !clockPinned/u);
});

test('the dock reads the lane the Reader publishes', () => {
  assert.match(entry, /inject: \(\) => \(\{ lane \}\)/u);
  assert.match(reader, /clockLane\?\.publish\(\{ visible: clockPinned, startTime: clockStart/u);
  assert.match(reader, /const clockPinned = pinnedInDock\(clockVisible, clockPhase\)/u);
});

test('the waiting row keeps its own place, separate from the clock', () => {
  // 「深度求索中」 predates the clock and must keep working untouched.
  assert.match(reader, /<WaitingStatus anchor=\{waitAnchor\}/u);
  assert.match(reader, /isAwaitingModel && <WaitingStatus/u);
});

test('the done phase stops the shimmer and adds a success dot', () => {
  const done = rule('.turnStatusLabelDone');
  assert.match(done, /animation:\s*none/u);
  assert.match(clock, /turnStatusDot/u);
  assert.match(rule('.turnStatusDot'), /border-radius:\s*50%/u);
  // The dot is a done-only mark; the running label must not have one.
  assert.match(clock, /<span className=\{css\.turnStatusLabel\}>本轮求索中<\/span>/u);
  assert.doesNotMatch(clock, /css\.turnStatusLabel\}>[^<]*turnStatusDot/u);
});

test('the leading clock ticks in both phases', () => {
  // The tick effect must not be gated on the phase: only the fields to its right
  // freeze when the turn closes.
  const effect = /const tick = \(\) => \{[\s\S]{0,220}?\};/u.exec(clock);
  assert.ok(effect, 'the tick body is present');
  assert.doesNotMatch(effect[0]!, /phase/u);
  assert.match(clock, /<WallClock now=\{now\} animated=\{running\} \/>/u);
});

test('the lane publishes only real changes and starts idle', () => {
  const lane = createClockLane();
  assert.deepEqual(lane.read(), IDLE_CLOCK);
  let notified = 0;
  const stop = lane.subscribe(() => {
    notified += 1;
  });
  lane.publish({ visible: true, startTime: 1_000, fallbackStart: null });
  assert.equal(notified, 1);
  // An identical publish must not wake the dock, or the row would flicker.
  lane.publish({ visible: true, startTime: 1_000, fallbackStart: null });
  assert.equal(notified, 1);
  lane.publish({ visible: true, startTime: 2_000, fallbackStart: null });
  assert.equal(notified, 2);
  stop();
  lane.publish(IDLE_CLOCK);
  assert.equal(notified, 2);
});
