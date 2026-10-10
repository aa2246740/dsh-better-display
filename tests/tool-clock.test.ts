import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callStartTime, forgetCallClock, runningClockBase } from '../src/client/tool-activity.ts';
import type { RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client';

const startedCall = (callId: string, time: number): RunningToolCall => ({
  phase: 'start', callId, name: 'bash', turn: 1, step: 0, time, argsRaw: '{"command":"sleep 60"}', subCalls: [],
});
const resultOf = (callId: string, callTime: number | null, time: number): ToolResultNode => ({
  kind: 'tool-result', seq: 1, callId, time, callTime,
  call: { name: 'bash', argsRaw: '{"command":"sleep 60"}' },
  content: [], isError: false, subCalls: [],
});

test('a dispatched call counts from its stamped start, not the mount time', () => {
  // The view remounts long after the tool/call event: base must stay the
  // session-stamped time, so the clock shows the real elapsed seconds.
  const block = startedCall('c1', 1_000);
  assert.equal(callStartTime({ block }), 1_000);
  assert.equal(runningClockBase('c1', block, 60_000), 1_000);
});

test('a draft-only call keeps the same base across remounts', () => {
  // A draft carries no timestamp; first-seen is remembered per call id so
  // remounting the view does not zero the clock.
  assert.equal(runningClockBase('c2', undefined, 10_000), 10_000);
  assert.equal(runningClockBase('c2', undefined, 30_000), 10_000);
});

test('a landed call head wins over the remembered draft time', () => {
  runningClockBase('c3', undefined, 10_000);
  assert.equal(runningClockBase('c3', startedCall('c3', 8_000), 20_000), 8_000);
});

test('settling forgets the first-seen time so the id can be reused safely', () => {
  runningClockBase('c4', undefined, 10_000);
  forgetCallClock('c4');
  assert.equal(runningClockBase('c4', undefined, 40_000), 40_000);
});

test('a settled result still reports its paired call time', () => {
  assert.equal(callStartTime({ block: resultOf('c5', 1_000, 5_000) }), 1_000);
  // A result whose call fell outside the window stamps nothing.
  assert.equal(callStartTime({ block: resultOf('c6', null, 5_000) }), null);
});
