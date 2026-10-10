import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Maid-atelier / phoebe-atelier hide rule, reduced to the :has() predicate. */
const SKIN_HIDE = '[data-conversation-scroll]:not(:has([data-chat-flow])) > [data-composer-seat]';

interface AttrNode {
  attrs: Record<string, string>;
  children: AttrNode[];
}

function hasAttr(node: AttrNode, name: string): boolean {
  if (Object.hasOwn(node.attrs, name)) return true;
  return node.children.some(child => hasAttr(child, name));
}

/** True when the skin rule would set the seat to display:none. */
function skinHidesComposerSeat(scroll: AttrNode): boolean {
  return !hasAttr(scroll, 'data-chat-flow');
}

function readerColumn(hook: boolean): AttrNode {
  return {
    attrs: hook ? { 'data-chat-flow': '' } : {},
    children: [{ attrs: { 'data-reader-turn': '1' }, children: [] }],
  };
}

test('Reader source keeps the native ChatView chat-flow hook on its column', () => {
  const source = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  const column = source.match(/<div className=\{css\.column\}[^>]*>/);
  assert.ok(column, 'Reader still renders css.column');
  assert.match(column[0], /data-chat-flow=""/);
});

test('committed client bundle publishes data-chat-flow for git installs', () => {
  const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(client, /"data-chat-flow":\s*""/);
  const compiled = readFileSync(resolve(root, 'lib/types/client/Reader.js'), 'utf8');
  assert.match(compiled, /"data-chat-flow":\s*""/);
});

test('Reader exposes rewind chat seats and pending steering markers', () => {
  const source = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  const seat = readFileSync(resolve(root, 'src/client/chat-seat.ts'), 'utf8');
  assert.match(seat, /data-chat-anchor-key/);
  assert.match(seat, /data-chat-flow-key/);
  assert.match(seat, /data-chat-node-key/);
  assert.match(source, /data-pending-steering/);
  assert.match(source, /data-pending-attachment-count/);
  const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(client, /data-chat-anchor-key/);
  assert.match(client, /data-pending-steering/);
});

test('skin empty-state hide stays off when Reader mounts inside the scrollport', () => {
  const inspectOnly: AttrNode = {
    attrs: { 'data-conversation-scroll': '' },
    children: [
      { attrs: { 'data-reader-turn': '1' }, children: [] },
      { attrs: { 'data-composer-seat': '' }, children: [] },
    ],
  };
  const withReader: AttrNode = {
    attrs: { 'data-conversation-scroll': '' },
    children: [readerColumn(true), { attrs: { 'data-composer-seat': '' }, children: [] }],
  };
  assert.equal(skinHidesComposerSeat(inspectOnly), true, SKIN_HIDE);
  assert.equal(skinHidesComposerSeat(withReader), false, SKIN_HIDE);
  assert.equal(skinHidesComposerSeat({
    attrs: { 'data-conversation-scroll': '' },
    children: [readerColumn(false), { attrs: { 'data-composer-seat': '' }, children: [] }],
  }), true);
});
