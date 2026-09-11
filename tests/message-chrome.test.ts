import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMessageClock, formatRanFor, formatRunDuration } from '../src/client/message-chrome.ts';

test('run duration matches official Chat labels', () => {
  assert.equal(formatRunDuration(0), '0秒');
  assert.equal(formatRunDuration(19_000), '19秒');
  assert.equal(formatRunDuration(118_000), '1分58秒');
  assert.equal(formatRunDuration(65_000), '1分05秒');
  assert.equal(formatRanFor(118_000), '用时 1分58秒');
});

test('same calendar day is HH:mm', () => {
  const now = new Date(2026, 8, 11, 16, 40).getTime();
  const time = new Date(2026, 8, 11, 16, 36).getTime();
  assert.equal(formatMessageClock(time, now), '16:36');
});

test('earlier this year includes month and day', () => {
  const now = new Date(2026, 8, 11, 16, 40).getTime();
  const time = new Date(2026, 7, 3, 9, 5).getTime();
  assert.equal(formatMessageClock(time, now), '8月3日 09:05');
});

test('other years include the year', () => {
  const now = new Date(2026, 8, 11, 16, 40).getTime();
  const time = new Date(2025, 11, 31, 23, 4).getTime();
  assert.equal(formatMessageClock(time, now), '2025年12月31日 23:04');
});
