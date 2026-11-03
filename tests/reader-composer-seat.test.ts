import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { hostComposerUsable, READER_COMPOSER_RESTORE } from '../src/client/composer-seat.js';
import { ReaderEntryPolicy, readerEntryRequested } from '../src/client/entry-policy.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Specificity tuple [ids, attributes-and-pseudos, elements] for the two selectors this fix compares. */
function specificity(selector: string): [number, number, number] {
  const expanded = selector.replace(/:has\(([^)]*)\)/g, ' $1 ');
  const ids = expanded.match(/#[\w-]+/g)?.length ?? 0;
  const attrs = expanded.match(/\[[^\]]+\]/g)?.length ?? 0;
  const without = expanded.replace(/\[[^\]]+\]/g, ' ').replace(/:[^\s#.[]+/g, ' ').replace(/#[\w-]+/g, ' ');
  const elements = without.match(/[a-zA-Z][\w-]*/g)?.length ?? 0;
  return [ids, attrs, elements];
}

const SKIN_HIDE = 'body[data-dsh-claude-style][data-dsh-claude-composer-active] [data-dsh-claude-composer-hidden] [data-composer-seat]';

test('a new session lands on reader and the host composer stays usable there', () => {
  const policy = new ReaderEntryPolicy(false);
  assert.equal(policy.select(null), 'reader');
  assert.equal(policy.select(undefined), 'reader');
  assert.equal(hostComposerUsable({ skinHidesSeat: false, readerMounted: true }), true);
  assert.equal(hostComposerUsable({ skinHidesSeat: true, readerMounted: true }), true);
});

test('?reader=1 still enters reading once and does not cover the composer', () => {
  assert.equal(readerEntryRequested('?reader=1'), true);
  let consumed = 0;
  const policy = new ReaderEntryPolicy(true, () => { consumed++; });
  assert.equal(policy.select('chat'), 'reader');
  assert.equal(consumed, 1);
  assert.equal(policy.select('chat'), null);
  assert.equal(hostComposerUsable({ skinHidesSeat: true, readerMounted: true }), true);
});

test('leaving the reader tab does not keep forcing the composer visible', () => {
  const policy = new ReaderEntryPolicy(false);
  assert.equal(policy.select('chat'), null);
  assert.equal(policy.select('trajectory'), null);
  assert.equal(policy.select('reader'), null);
  assert.equal(hostComposerUsable({ skinHidesSeat: true, readerMounted: false }), false);
  assert.equal(hostComposerUsable({ skinHidesSeat: false, readerMounted: false }), true);
});

test('the reader stylesheet outranks the skin hide and the bundle ships it', () => {
  const css = readFileSync(resolve(root, 'src/client/Reader.module.css'), 'utf8');
  const reader = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  assert.match(reader, /data-dsh-better-display=/);
  assert.match(css, new RegExp(`:global\\(${READER_COMPOSER_RESTORE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`));
  assert.match(css, /display:\s*flex\s*!important/);
  const ours = specificity(READER_COMPOSER_RESTORE);
  const skin = specificity(SKIN_HIDE);
  assert.ok(ours[0] > skin[0] || ours[1] > skin[1] || (ours[1] === skin[1] && ours[2] > skin[2]), `${ours} should beat ${skin}`);
  const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(client, /html body\[data-dsh-claude-style\]\[data-dsh-claude-composer-active\] \[data-dsh-claude-composer-hidden\]:has\(\[data-dsh-better-display\]\) \[data-composer-seat\]\{display:flex!important\}/);
});
