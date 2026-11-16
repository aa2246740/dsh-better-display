import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { ANSWER_BAND, TOOL_BAND } from '../src/client/image-group.js';
import { attachmentLabel } from '../src/client/image-group-order.js';

/**
 * The grouping rule depends on the entry point, and that asymmetry is the feature:
 *
 *  - opening from a TOOL call shows every picture of the turn;
 *  - opening from the ANSWER shows only the answer's pictures.
 *
 * The scope expresses it as "opening at band N pages through every member with
 * `rank >= N`, ordered by band then document order". `TOOL_BAND` is the wider view and
 * has the lower number, so a tool entry keeps everything and an answer entry drops the
 * tool pictures.
 *
 * A static tree cannot express this: an outer group would always win.
 */
interface Member {
  id: string;
  rank: number;
}

const root = resolve(import.meta.dirname, '..');

/** Same predicate and ordering the scope uses. */
function visibleAt(members: Member[], ceiling: number): Member[] {
  return members.filter(member => member.rank >= ceiling).sort((a, b) => a.rank - b.rank);
}

const turn: Member[] = [
  { id: 'tool-1', rank: TOOL_BAND },
  { id: 'tool-2', rank: TOOL_BAND },
  { id: 'tool-3', rank: TOOL_BAND },
  { id: 'answer-1', rank: ANSWER_BAND },
  { id: 'answer-2', rank: ANSWER_BAND },
  { id: 'answer-3', rank: ANSWER_BAND },
  { id: 'answer-4', rank: ANSWER_BAND }
];

test('opening from a tool call pages through the whole turn', () => {
  // Three tool pictures then four answer pictures: 7 in total, tools first.
  const visible = visibleAt(turn, TOOL_BAND);
  assert.equal(visible.length, 7);
  assert.deepEqual(
    visible.map(member => member.id),
    ['tool-1', 'tool-2', 'tool-3', 'answer-1', 'answer-2', 'answer-3', 'answer-4']
  );
});

test('opening from the answer sees only the answer', () => {
  const visible = visibleAt(turn, ANSWER_BAND);
  assert.equal(visible.length, 4);
  assert.deepEqual(
    visible.map(member => member.id),
    ['answer-1', 'answer-2', 'answer-3', 'answer-4']
  );
  // And it reads `1/4`: the first answer picture is position 1.
  assert.equal(visible[0]!.id, 'answer-1');
});

test('a tool call that produced one picture still reads 1/1', () => {
  const single: Member[] = [{ id: 'tool-1', rank: TOOL_BAND }];
  assert.equal(visibleAt(single, TOOL_BAND).length, 1);
});

test('a turn with no answer pictures leaves the tool group intact', () => {
  const toolsOnly: Member[] = [
    { id: 'tool-1', rank: TOOL_BAND },
    { id: 'tool-2', rank: TOOL_BAND }
  ];
  assert.equal(visibleAt(toolsOnly, TOOL_BAND).length, 2);
});

test('stepping inside the answer band cannot escape into tool pictures', () => {
  // The list is filtered first, so `step` past the end yields nothing rather than
  // walking back into the tool pictures.
  const visible = visibleAt(turn, ANSWER_BAND);
  const index = visible.findIndex(member => member.id === 'answer-4');
  assert.equal(visible[index + 1], undefined);
  assert.equal(visible[index - 1]!.id, 'answer-3');
});

test('the group is numbered from document order, not from render callbacks', () => {
  // The reported bug: a tool-opened picture claimed the wrong position. A tool picture
  // sits inside a collapsible process block, and that block renders no children while
  // folded — so those pictures were not registered at all until the block was opened,
  // and the order depended on what had been expanded. The scope therefore renumbers
  // from the thumbnails it finds in the DOM.
  const group = readFileSync(resolve(root, 'src/client/image-group.tsx'), 'utf8');
  const thumb = readFileSync(resolve(root, 'src/client/ImageThumb.tsx'), 'utf8');
  assert.match(group, /querySelectorAll\('\[data-reader-thumb\]'\)/u);
  assert.match(group, /renumberFromDom/u);
  // Members sort by band then by that document position.
  assert.match(group, /a\.rank - b\.rank \|\| \(a\.seq \?\? 0\) - \(b\.seq \?\? 0\)/u);
  // Every thumbnail carries the attribute the query relies on.
  assert.match(thumb, /data-reader-thumb=\{member\.id\}/u);
});

test('a tool attachment caption carries a file name with a suffix', () => {
  // The Host strips local path information from `ImageAttachmentRef.name`, so a full
  // path cannot be recovered for an attached image; the extension can, from the
  // verified media type.
  assert.equal(attachmentLabel('shot', 'image/png'), 'shot.png');
  assert.equal(attachmentLabel('shot', 'image/jpeg'), 'shot.jpg');
  assert.equal(attachmentLabel('shot.webp', 'image/png'), 'shot.webp', 'an existing suffix wins');
  assert.equal(attachmentLabel(undefined, 'image/png'), '工具调用图片');
  assert.equal(attachmentLabel('  ', 'image/png'), '工具调用图片');
  assert.equal(attachmentLabel('shot', undefined), 'shot', 'no media type, no invented suffix');
  assert.equal(attachmentLabel('shot', 'application/octet-stream'), 'shot');
});
