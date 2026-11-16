import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import {
  IDLE_GROUP,
  groupCaption,
  groupMembers,
  settleDrag,
  stepTarget
} from '../src/client/image-group-order.js';

/**
 * The viewer's rules, as reported and then fixed:
 *
 * 1. the first open could not be dragged — dragging was gated on a measurement
 *    that was still stale on the first frame;
 * 2. a picture should be draggable at any size and any zoom, and a released drag
 *    must spring back so the picture is always reachable again;
 * 3. the title bar needs the picture's origin and a `1/3` pager, shown even for a
 *    single picture with both arrows disabled.
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
  // `pannable` came from a layout effect that ran before the modal had a box, so
  // the first open silently refused the drag until a zoom re-measured.
  assert.doesNotMatch(lightbox, /if \(!pannable\) return/u);
  assert.doesNotMatch(lightbox, /if \(scale <= 1\) return/u);
});

test('one dialog per answer, so paging swaps the picture instead of stacking dialogs', () => {
  // The reported bug: every picture owned a `<dialog>` and paging only set
  // `openId`, so `›` made the neighbour call `showModal()` on its own dialog. Two
  // dialogs stacked, the picture never changed, and `‹` had nothing to go back to.
  //
  // The dialog now belongs to the scope, not to a picture, and it renders whatever
  // `viewer.current` is.
  const group = readFileSync(resolve(root, 'src/client/image-group.tsx'), 'utf8');
  const thumb = readFileSync(resolve(root, 'src/client/ImageThumb.tsx'), 'utf8');
  assert.match(group, /export function ImageViewerScope/u);
  // A thumbnail only hands the picture over; it owns no dialog.
  assert.match(thumb, /viewer\?\.open\(/u);
});

test('a thumbnail joins the group on mount, not when it is clicked', () => {
  // The reported bug: four pictures in one answer never read `1/4`. A picture only
  // registered when it was opened, so the total was however many the reader had
  // clicked so far. Joining has to happen as the answer renders.
  const thumb = readFileSync(resolve(root, 'src/client/ImageThumb.tsx'), 'utf8');
  const group = readFileSync(resolve(root, 'src/client/image-group.tsx'), 'utf8');
  // The thumbnail registers from an effect, keyed on the stable member.
  assert.match(thumb, /const join = (?:viewer|shared)\?\.join/u);
  assert.match(thumb, /useEffect\(\(\) => \{\s*join\?\.\(member\);/u);
  // The viewer exposes it, and `open` also registers for the first-open case.
  assert.match(group, /join: \(member: ImageThumbMember\) => void/u);
  // Joining is idempotent, so a re-render cannot duplicate a picture.
  assert.match(group, /if \(existing !== undefined\) \{/u);
});

test('one scope on the turn, and bands decide how wide it pages', () => {
  // An answer arrives as several parts — `assistantSegments` splits it at each
  // reasoning / body boundary — and each part renders its own `Blocks`. A scope at
  // either level started a fresh group per part, so four pictures showed as two
  // groups. The scope now lives on the TURN, and the part level only declares which
  // band its pictures belong to.
  const reader = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  const assistant = readFileSync(resolve(root, 'src/client/AssistantNode.tsx'), 'utf8');
  const blocks = readFileSync(resolve(root, 'src/client/Blocks.tsx'), 'utf8');
  const markdown = readFileSync(resolve(root, 'src/client/markdown/MarkdownText.tsx'), 'utf8');
  // Exactly one scope, on the turn.
  assert.match(reader, /<ImageViewerScope/u);
  assert.match(reader, /<\/ImageViewerScope>/u);
  // The turn's tool pictures are in the wider band.
  assert.match(reader, /<ImageBand rank=\{TOOL_BAND\}>/u);
  // The answer declares the narrower band instead of a scope.
  assert.match(assistant, /<ImageBand rank=\{ANSWER_BAND\}>/u);
  assert.doesNotMatch(assistant, /ImageViewerScope/u);
  // The inner levels own no scope of their own.
  assert.doesNotMatch(blocks, /ImageViewerScope/u);
  assert.doesNotMatch(markdown, /ImageViewerScope/u);
});

test('the viewer follows viewer.current, not its own open state', () => {
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /const current = viewer\.current/u);
  assert.match(lightbox, /if \(current !== null && !node\.open\) node\.showModal\(\)/u);
  assert.match(lightbox, /if \(current === null && node\.open\) node\.close\(\)/u);
  // Paging goes through the shared viewer.
  assert.match(lightbox, /viewer\.step\(-1\)/u);
  assert.match(lightbox, /viewer\.step\(1\)/u);
});

test('the picture size is re-measured when the picture changes', () => {
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  // A new picture must not inherit the previous one's scale or offset.
  assert.match(lightbox, /setNatural\(null\)/u);
  assert.match(lightbox, /\}, \[src\]\)/u);
});

test('the pager is always shown, with a disabled arrow at either end', () => {
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /data-reader-image-counter/u);
  assert.match(lightbox, /disabled=\{!paging \|\| viewer\.index <= 1\}/u);
  assert.match(lightbox, /disabled=\{!paging \|\| viewer\.index >= viewer\.total\}/u);
  assert.match(rule('.lightboxNav:disabled'), /opacity/u);
});

test('dragging moves the scroll offset, so oversized pictures are reachable', () => {
  assert.match(lightbox, /node\.scrollLeft = settled\.left/u);
  assert.match(lightbox, /node\.scrollTop = settled\.top/u);
  assert.match(rule('.imageStage'), /overflow:\s*auto/u);
});

test('the stage always shows a grab cursor, at any size', () => {
  // Not scoped to `[data-pannable]`: the reader asked to be able to drag at any
  // zoom, so the affordance must never be missing.
  assert.match(rule('.imageStage'), /cursor:\s*grab/u);
  assert.match(rule('.imageStage[data-dragging]'), /cursor:\s*grabbing/u);
  assert.doesNotMatch(css, /\.imageStage\[data-pannable\]\s*\{[^}]*cursor/u);
});

/**
 * A drag moves the picture by (scroll delta + free delta), and that total must
 * equal the pointer delta. Asserting the two layers separately would happily pin
 * an inverted sign, which is exactly how the direction bug shipped: at zoom <
 * 100% the scroll range is empty, so every pixel went through the free layer and
 * the picture moved against the hand.
 */
function pictureDelta(
  start: { left: number; free: number },
  moved: { left: number; free: number }
): number {
  return moved.left - start.left + (moved.free - start.free);
}

test('the picture follows the pointer at zoom below 100%, where nothing scrolls', () => {
  // No scroll range at all: the whole displacement goes through the free layer.
  const start = { left: 0, free: 0 };
  const moved = settleDrag({
    wantLeft: 0,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    freeX: 0,
    freeY: 0,
    release: false
  });
  assert.equal(moved.left, 0);
  // A pointer that moves +120px right must take the picture +120px right.
  const shifted = settleDrag({
    wantLeft: -120,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    freeX: 0,
    freeY: 0,
    release: false
  });
  assert.equal(
    pictureDelta(start, { left: shifted.left, free: shifted.freeX }),
    120,
    'dragging right moves the picture right'
  );
  void moved;
});

test('a released drag keeps where the picture was put', () => {
  // While dragging, whatever the scroll range refuses stays in the free layer, so
  // the picture follows the pointer past its own edge.
  const moving = settleDrag({
    wantLeft: 900,
    wantTop: 40,
    maxLeft: 400,
    maxTop: 100,
    freeX: 0,
    freeY: 0,
    release: false
  });
  assert.equal(moving.left, 400, 'the scroll offset stops at the end of the range');
  // The pointer asked for 900 and the scroll layer delivered 400, so the picture
  // still has 500 to travel in the other direction to stay under the hand.
  assert.equal(moving.freeX, -500, 'the shortfall is carried by the free layer');

  // Releasing must NOT snap the free layer back. It used to, and that made every
  // drag of a picture smaller than the stage spring home — the reported bug.
  const released = settleDrag({
    wantLeft: 400,
    wantTop: 40,
    maxLeft: 400,
    maxTop: 100,
    freeX: -500,
    freeY: 0,
    release: true,
    // Picture much larger than the stage, so nothing needs clamping.
    visibleFraction: 0.15,
    viewWidth: 300,
    viewHeight: 200,
    pictureWidth: 2000,
    pictureHeight: 1500
  });
  assert.equal(released.left, 400);
  assert.equal(released.freeX, -500, 'the picture stays where it was dragged');
});

test('a small picture stays where it is dropped, only kept partly visible', () => {
  const moving = settleDrag({
    wantLeft: 120,
    wantTop: -80,
    maxLeft: 0,
    maxTop: 0,
    freeX: 0,
    freeY: 0,
    release: false
  });
  assert.equal(moving.left, 0);
  // The scroll offset was refused entirely, so the free layer carries the inverse
  // of the request; the sum is what the eye sees.
  assert.equal(moving.freeX, -120);
  assert.equal(moving.freeY, 80);

  // A 100x80 picture in a 400x300 stage, dragged far to the right: it keeps most
  // of that offset instead of snapping back to centre.
  const released = settleDrag({
    wantLeft: 0,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    freeX: 200,
    freeY: 0,
    release: true,
    visibleFraction: 0.15,
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 100,
    pictureHeight: 80
  });
  assert.equal(released.left, 0);
  assert.equal(released.freeX, 200, 'within the limit, so untouched');
});

test('the picture may slide equally far past either edge', () => {
  // The reported bug, in its real form: the stage CENTRES a picture smaller than
  // itself, so the picture's resting left edge is at (view - picture) / 2 = 150 for
  // a 100px picture in a 400px stage. Bounds computed against an origin of 0 gave a
  // free range of [-85, 385] — measured from 150 that is [65, 535], so dragging
  // left died after 85px while dragging right ran 385px.
  //
  // With the resting offset passed in, the free range is symmetric about 0 and the
  // picture's overhang past each edge is identical.
  const base = {
    wantLeft: 0,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    release: true,
    visibleFraction: 0.15 as number | undefined,
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 100,
    pictureHeight: 80,
    restX: (400 - 100) / 2,
    restY: (300 - 80) / 2
  };
  const right = settleDrag({ ...base, freeX: 900, freeY: 0 });
  const left = settleDrag({ ...base, freeX: -900, freeY: 0 });
  // Symmetric about zero, so both directions travel the same distance.
  assert.equal(right.freeX, -left.freeX, 'equal travel each way');
  // At the limit the picture's overflow past each edge is identical, which is the
  // property the reader actually feels.
  const leftOverhang = -(base.restX + left.freeX);
  const rightOverhang = base.restX + right.freeX + base.pictureWidth - base.viewWidth;
  assert.equal(leftOverhang, rightOverhang, 'equal overhang past each edge');
  // keep=0.15 leaves 85% of the 100px picture able to go past an edge.
  assert.equal(leftOverhang, 85);
});

test('the resting offset is what makes the two directions match', () => {
  const common = {
    wantLeft: 0,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    release: true,
    visibleFraction: 0.15 as number | undefined,
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 100,
    pictureHeight: 80
  };
  // Omitting `restX` falls back to the centring formula, so the default already
  // matches an explicit pass — the bug was computing bounds against an origin of 0
  // while the picture actually sat at 150.
  const implicit = settleDrag({ ...common, freeX: -900, freeY: 0 });
  const explicit = settleDrag({ ...common, restX: 150, restY: 110, freeX: -900, freeY: 0 });
  assert.equal(implicit.freeX, explicit.freeX, 'the default matches the real resting point');
  // At the limit the picture's left edge is 85px past the view's left edge.
  const leftEdge = 150 + explicit.freeX;
  assert.equal(-leftEdge, 85);
});

test('a tall drag limit is symmetric on the vertical axis too', () => {
  const base = {
    wantLeft: 0,
    wantTop: 0,
    maxLeft: 0,
    maxTop: 0,
    release: true,
    visibleFraction: 0.15 as number | undefined,
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 100,
    pictureHeight: 80,
    restX: (400 - 100) / 2,
    restY: (300 - 80) / 2
  };
  const down = settleDrag({ ...base, freeX: 0, freeY: 900 });
  const up = settleDrag({ ...base, freeX: 0, freeY: -900 });
  assert.equal(down.freeY, -up.freeY, 'equal travel up and down');
  const topOverhang = -(base.restY + up.freeY);
  const bottomOverhang = base.restY + down.freeY + base.pictureHeight - base.viewHeight;
  assert.equal(topOverhang, bottomOverhang, 'equal overhang past each edge');
  // 85% of the 80px picture may go past either edge.
  assert.equal(topOverhang, 68);
});

test('a drag cannot push the scroll offset below zero', () => {
  const settled = settleDrag({
    wantLeft: -300,
    wantTop: -50,
    maxLeft: 400,
    maxTop: 100,
    freeX: 0,
    freeY: 0,
    release: false
  });
  assert.equal(settled.left, 0);
  assert.equal(settled.top, 0);
  // clamp refused -300, so the free layer holds +300 to keep the sum at the
  // pointer's request.
  assert.equal(settled.freeX, 300);
});

test('a drag that ends over the backdrop does not close the viewer', () => {
  // The browser fires `click` on whatever is under the pointer when a drag ends.
  // If that is the dialog itself, the plain backdrop handler would close the
  // viewer mid-gesture, which is what the reader reported.
  assert.match(lightbox, /const draggedRef = useRef\(false\)/u);
  // A gesture is promoted to a drag once the pointer actually travels.
  assert.match(lightbox, /draggedRef\.current = true/u);
  // ...and the click that follows is swallowed, once.
  assert.match(lightbox, /if \(draggedRef\.current\) \{\s*draggedRef\.current = false;\s*return;/u);
  // A fresh gesture starts as a click, so the flag cannot leak into the next one.
  assert.match(lightbox, /draggedRef\.current = false;\s*dragStart\.current = \{/u);
});

test('the title bar puts the path on one line and the pager below it', () => {
  // Sharing a row makes a long path and the controls fight for the same space.
  assert.match(rule('.lightboxHeader'), /flex-direction:\s*column/u);
  assert.match(rule('.lightboxHeader'), /align-items:\s*center/u);
  assert.match(rule('.lightboxCaption'), /text-align:\s*center/u);
  assert.match(lightbox, /data-reader-image-caption/u);
  assert.match(lightbox, /data-reader-image-pager/u);
});

test('the minimap appears only while dragging', () => {
  // An always-on overlay covers the very part of the picture being examined.
  assert.match(lightbox, /\{dragging && \(\s*<div className=\{css\.lightboxMinimap\}/u);
  assert.match(rule('.lightboxMinimap'), /position:\s*absolute/u);
  // It is anchored to the dialog, not the viewport.
  assert.match(rule('.imageDialog'), /position:\s*relative/u);
  assert.match(lightbox, /data-reader-image-viewbox/u);
});

test('the caption copies its path on double click', () => {
  assert.match(lightbox, /onDoubleClick=\{\(\) => \{/u);
  assert.match(lightbox, /navigator\.clipboard\?\.writeText\(caption\)/u);
  // The label confirms the copy, so the reader knows it happened.
  assert.match(lightbox, /已复制/u);
  assert.match(lightbox, /data-copied/u);
});

test('the minimap is large enough to read a position from', () => {
  // 92x68 was too small to tell where you were in a long screenshot.
  const minimap = rule('.lightboxMinimap');
  assert.match(minimap, /width:\s*160px/u);
  assert.match(minimap, /height:\s*118px/u);
});

test('caption wording falls back sensibly for a blob without a name', () => {
  assert.equal(groupCaption('shot.png', 'alt'), 'shot.png');
  assert.equal(groupCaption(undefined, 'alt text'), 'alt text');
  assert.equal(groupCaption('', ''), '图片');
});

test('a lone picture reports no neighbour, so its arrows are both disabled', () => {
  assert.equal(groupMembers(IDLE_GROUP, 'a').length, 0);
  assert.equal(stepTarget(IDLE_GROUP, 'a', 1), null);
  assert.equal(stepTarget(IDLE_GROUP, 'a', -1), null);
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
