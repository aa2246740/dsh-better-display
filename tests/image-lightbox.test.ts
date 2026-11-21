import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, vi } from 'vitest';

const root = resolve(import.meta.dirname, '..');

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ CodeBlock: () => null }));
vi.mock('../src/client/McpAppFrame.js', () => ({
  McpAppCodeBlock: () => null,
  StreamingMcpAppPlaceholder: () => null
}));
const cssModule = new Proxy({}, { get: (_target, name) => String(name) });
vi.mock('../src/client/Reader.module.css', () => ({ default: cssModule }));

const { clampScale, settleDrag } = await import('../src/client/ImageLightbox.js');

/** A geometry where the picture is larger than the viewport in both axes. */
function oversize(): Parameters<typeof settleDrag>[0]['geometry'] {
  return {
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 2000,
    pictureHeight: 1600,
    maxLeft: 1600,
    maxTop: 1300,
    restX: 0,
    restY: 0
  };
}

/** A geometry where the picture fits, so it rests centred in the viewport. */
function fitting(): Parameters<typeof settleDrag>[0]['geometry'] {
  return {
    viewWidth: 400,
    viewHeight: 300,
    pictureWidth: 200,
    pictureHeight: 100,
    maxLeft: 0,
    maxTop: 0,
    restX: 100,
    restY: 100
  };
}

test('the wheel scale stays inside its range', () => {
  assert.equal(clampScale(0.1), 0.5, 'below the floor');
  assert.equal(clampScale(100), 8, 'above the ceiling');
  assert.equal(clampScale(2.5), 2.5, 'inside the range');
});

test('dragging past the scroll range keeps the overshoot, not a snap back', () => {
  // A picture the reader has dragged right, past the last scrollable pixel.
  const settled = settleDrag({
    wantLeft: -120,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: false,
    geometry: oversize()
  });
  assert.equal(settled.left, 0, 'the scroll stops at its start');
  assert.equal(settled.freeX, 120, 'and the overshoot is carried in the free offset');
});

test('a released picture stays where it was put', () => {
  const geometry = oversize();
  const settled = settleDrag({
    wantLeft: 800,
    wantTop: 600,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  // Well inside the scrollable range: no free offset is needed or produced.
  assert.equal(settled.left, 800);
  assert.equal(settled.top, 600);
  assert.equal(settled.freeX, 0);
  assert.equal(settled.freeY, 0);
});

test('a released picture keeps a sliver on screen in both directions', () => {
  // A picture smaller than the viewport, so it rests centred with a real offset. Here the
  // free range is symmetric, because the scroll has nothing to take up.
  const geometry = fitting();
  const left = settleDrag({
    wantLeft: -5000,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  const right = settleDrag({
    wantLeft: 5000,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  // 15% of a 200px picture is 30px of sliver, measured from the centred rest position.
  // A negative `wantLeft` drags the view left, which carries the picture right.
  assert.equal(left.freeX, 270, 'dragged hard left, the picture stops at its keep-visible edge');
  assert.equal(right.freeX, -270, 'and the same distance the other way');
  assert.equal(Math.abs(left.freeX), Math.abs(right.freeX), 'symmetric for a centred picture');
});

test('a picture larger than the viewport is limited per direction', () => {
  // For an oversize picture the scroll takes up most of the travel, so the free offset
  // only carries the overshoot and its bounds are not mirrored. What matters is that
  // neither drag can leave the stage empty.
  const geometry = oversize();
  const left = settleDrag({
    wantLeft: -5000,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  const right = settleDrag({
    wantLeft: 5000,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  assert.equal(left.freeX, 100, 'the left overshoot is capped');
  assert.equal(right.freeX, -1700, 'and the right overshoot by its own bound');
  // In both cases part of the picture is still inside the stage.
  assert.ok(geometry.pictureWidth + left.freeX > 0, 'picture still visible after a left drag');
  assert.ok(geometry.restX + right.freeX < geometry.viewWidth, 'and after a right drag');
});

test('a picture smaller than the viewport still rests centred', () => {
  // `restX`/`restY` are the centring offsets; a drag is measured against them so a small
  // picture does not appear to jump when the pointer moves.
  const geometry = fitting();
  const settled = settleDrag({
    wantLeft: -80,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: false,
    geometry
  });
  assert.equal(settled.left, 0, 'nothing to scroll');
  assert.equal(settled.freeX, 80, 'the drag is carried in the free offset');
});

test('the viewer renders one dialog and the reading view has no other', () => {
  // Two dialogs stacked was the original paging bug: `›` made the neighbour call
  // `showModal()` on its own dialog. One viewer, one dialog.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  // Strip comments first: the doc comment mentions the element in prose.
  const code = lightbox.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  assert.equal((code.match(/<dialog/gu) ?? []).length, 1, 'the viewer owns one dialog');
  const blocks = readFileSync(resolve(root, 'src/client/Blocks.tsx'), 'utf8');
  const blockCode = blocks.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  assert.doesNotMatch(blockCode, /<dialog/u, 'the image block renders no dialog of its own');
  assert.match(blocks, /<ImageLightbox/u, 'and uses the shared viewer');
});

test('the wheel listener is non-passive and preventDefault is reachable', () => {
  // A passive listener cannot stop the page from scrolling behind the dialog, which is
  // the difference between zooming and scrolling.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/u);
  assert.match(lightbox, /event\.preventDefault\(\)/u);
});

test('the stage scrolls and the picture is transformed, not clipped', () => {
  // A `max-width` on the img would cap zoom at whatever already fits, so the stage owns
  // the viewport box and the picture is scaled inside it.
  const css = readFileSync(resolve(root, 'src/client/Reader.module.css'), 'utf8');
  const stage = /\.imageStage\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(stage, /overflow:\s*auto/u, 'the stage scrolls');
  const inner = /\.imageStageInner\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(inner, /width:\s*max-content/u, 'the picture is laid out at its own size');
});

test('a click that ends a drag does not close the dialog', () => {
  // Dragging off the picture leaves a trailing click on the backdrop; without the guard
  // the viewer closes the moment the drag ends.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /if \(dragged\.current\) \{/u);
  assert.match(lightbox, /Math\.abs\(dx\) \+ Math\.abs\(dy\) > 2/u);
});
