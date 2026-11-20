import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'vitest';
import { turnTailAnchorProps } from '../src/client/chat-seat.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = (path: string) => readFileSync(resolve(root, path), 'utf8');

// #88. Host TurnTailNodeView (0.2.1-rc.5 and 0.2.2-rc.5):
//   <div className={css.root} data-turn-tail={data.turn} data-actions-reveal=...>{tail}...</div>
// Per-turn plugins look a turn up with [data-turn-tail="<turn>"].

test('the anchor carries the turn number the host writes, and nothing else', () => {
  assert.deepEqual(turnTailAnchorProps(7), { 'data-turn-tail': '7' });
  assert.deepEqual(turnTailAnchorProps(0), { 'data-turn-tail': '0' });
  for (const missing of [undefined, null, -1, 1.5, Number.NaN])
    assert.deepEqual(
      turnTailAnchorProps(missing as number | null | undefined),
      {},
      String(missing)
    );
});

test('a turn collapsing out after a rewind publishes no anchor', () => {
  assert.deepEqual(turnTailAnchorProps(7, true), {});
});

// OfficialContent and motion import host runtime packages, so the rendered
// wrapper is checked in tests/fixtures/reader-official-users.tsx (real Reader,
// real slot renderer). Here: the wiring that fixture cannot reach.
test('the Reader tail wrapper spreads the anchor and keeps display: contents', () => {
  const content = source('src/client/OfficialContent.tsx');
  assert.match(
    content,
    /<div data-reader-official-tail \{\.\.\.turnTailAnchorProps\(anchorTurn\)\} style=\{\{ display: 'contents' \}\}>/
  );
  assert.doesNotMatch(content, /data-actions-reveal/);
});

test('the Reader passes only its own closed turn number and drops it while retiring', () => {
  const reader = source('src/client/Reader.tsx');
  assert.match(reader, /const retiring = useContext\(RetiringTurnContext\);/);
  assert.match(
    reader,
    /const anchorTurn = !retiring && tailData && tailData\.turn === group\.turn \? tailData\.turn : undefined;/
  );
  assert.match(
    reader,
    /boundary\.status === 'closed' && <BlockBoundary><OfficialTail [^>]*anchorTurn=\{anchorTurn\}/
  );
});

test('retiring content tells its turn that it is leaving', () => {
  const motion = source('src/client/motion.tsx');
  assert.match(
    motion,
    /<RetiringTurnContext\.Provider value=\{!visible\}>\{children\}<\/RetiringTurnContext\.Provider>/
  );
});
