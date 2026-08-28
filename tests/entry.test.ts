import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReaderEntryPolicy, readerEntryRequested } from '../src/client/entry-policy.js';

test('fresh sessions default to reading, without requiring a special URL', () => {
  const policy = new ReaderEntryPolicy(false);
  assert.equal(policy.select(null), 'reader');
  assert.equal(policy.select('reader'), null);
  assert.equal(policy.select(undefined), 'reader');
});

test('an explicit native or third-party tab selection is not overwritten', () => {
  const policy = new ReaderEntryPolicy(false);
  for (const view of ['chat', 'trajectory', 'other-plugin']) assert.equal(policy.select(view), null);
  assert.equal(policy.select(null), 'reader');
  assert.equal(policy.select('chat'), null);
});

test('the trial URL enters reading once and releases later tab choices', () => {
  let consumed = 0;
  const policy = new ReaderEntryPolicy(true, () => { consumed++; });
  assert.equal(policy.select('chat'), 'reader');
  assert.equal(consumed, 1);
  assert.equal(policy.select('reader'), null);
  assert.equal(policy.select('chat'), null);
  assert.equal(policy.select('trajectory'), null);
  assert.equal(consumed, 1);
  assert.equal(policy.select(null), 'reader');
});

test('already-selected reading still consumes the entry request', () => {
  let consumed = false;
  const policy = new ReaderEntryPolicy(true, () => { consumed = true; });
  assert.equal(policy.select('reader'), null);
  assert.equal(consumed, true);
  assert.equal(policy.select('chat'), null);
});

test('current and previously delivered trial links have real entry semantics', () => {
  for (const query of ['?reader=1', '?reader=0.1.0-trial.2', '?reader=0.1.0-trial.3']) assert.equal(readerEntryRequested(query), true);
  for (const query of ['', '?reader=0', '?reader=unrelated', '?other=reader']) assert.equal(readerEntryRequested(query), false);
});
