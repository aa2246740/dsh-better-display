import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import {
  IDLE_GROUP,
  groupCaption,
  groupMembers,
  stepTarget
} from '../src/client/image-group-order.js';

/**
 * Three reports, and what each one pins:
 *
 * 1. the first open could not be dragged until a zoom happened — dragging was
 *    gated on an overflow measurement that was still stale on the first frame;
 * 2. a picture should be draggable at any size, at any zoom;
 * 3. the viewer needs a title bar with the picture's origin and a `‹ 1/2 ›`
 *    pager scoped to the answer it belongs to.
 */
const root = resolve(import.meta.dirname, '..');
const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
const css = readFileSync(resolve(root, 'src/client/Reader.module.css'), 'utf8').replace(
  /\r\n/g,
  '\n'
);

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`, 'u').exec(css);
  assert.ok(match, `expected a rule for ${selector}`);
  return match[1]!;
}

test('dragging is never gated on a measurement, so the first open works', () => {
  // The reported bug: `if (!pannable) return;` inside onPointerDown. `pannable`
  // came from a layout effect that ran before the modal had a box, so the first
  // open silently refused the drag until a zoom re-measured.
  const pointerDown = /onPointerDown=\{([\s\S]*?)\n          \}\}/u.exec(lightbox);
  assert.ok(pointerDown, 'the stage has a pointer-down handler');
  assert.doesNotMatch(pointerDown[1]!, /if \(!pannable\) return/u);
  assert.doesNotMatch(lightbox, /if \(scale <= 1\) return/u);
  // `pannable` is only allowed to drive the cursor affordance now.
  assert.match(lightbox, /data-pannable=\{pannable \? '' : undefined\}/u);
});

test('the picture size is known before the modal is shown', () => {
  // Reading the decoded element up front is what keeps the first frame correct;
  // the old code relied on a later render to fill `natural` in.
  assert.match(lightbox, /const image = node\.querySelector\('img'\)/u);
  assert.match(lightbox, /image\.complete && image\.naturalWidth > 0/u);
  assert.match(
    lightbox,
    /setNatural\(\{ width: image\.naturalWidth, height: image\.naturalHeight \}\)/u
  );
});

test('dragging moves the scroll offset, so oversized pictures are reachable', () => {
  assert.match(lightbox, /node\.scrollLeft = start\.left - \(event\.clientX - start\.x\)/u);
  assert.match(lightbox, /node\.scrollTop = start\.top - \(event\.clientY - start\.y\)/u);
  assert.match(rule('.imageStage'), /overflow:\s*auto/u);
});

test('the title bar shows the origin and the position in the group', () => {
  assert.match(lightbox, /data-reader-image-caption/u);
  assert.match(lightbox, /data-reader-image-counter/u);
  // The counter renders `index/total`.
  assert.match(lightbox, /position\.index/u);
  assert.match(lightbox, /position\.total/u);
  // The caption truncates from the left so the file name survives a long path.
  assert.match(rule('.lightboxCaption'), /direction:\s*rtl/u);
  assert.match(rule('.lightboxCaption'), /unicode-bidi:\s*plaintext/u);
});

test('the pager only appears for a group, and never for a lone picture', () => {
  // `position.step` is undefined outside a group, which is the single-picture
  // case a tool call produces.
  assert.match(lightbox, /const paging = position\.step !== undefined/u);
  assert.match(lightbox, /\{paging &&/u);
  assert.match(lightbox, /上一张/u);
  assert.match(lightbox, /下一张/u);
  // Arrow keys page too.
  assert.match(lightbox, /ArrowLeft/u);
  assert.match(lightbox, /ArrowRight/u);
});

test('caption wording falls back sensibly for a blob without a name', () => {
  // A tool attachment may have no file name; the caption must never be blank.
  assert.equal(groupCaption('shot.png', 'alt'), 'shot.png');
  assert.equal(groupCaption(undefined, 'alt text'), 'alt text');
  assert.equal(groupCaption('', ''), '图片');
});

test('a lone picture reports no neighbour, so the pager stays hidden', () => {
  assert.equal(groupMembers(IDLE_GROUP, 'a').length, 0);
  assert.equal(stepTarget(IDLE_GROUP, 'a', 1), null);
  // A real neighbour is found, and the end of the group yields null.
  const group = {
    entries: [
      { id: 'a', src: 'a.png' },
      { id: 'b', src: 'b.png' }
    ]
  };
  assert.equal(stepTarget(group, 'a', 1), 'b');
  assert.equal(stepTarget(group, 'b', 1), null);
  assert.equal(stepTarget(group, 'b', -1), 'a');
});
