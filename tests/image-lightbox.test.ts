import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, vi } from 'vitest';

const root = resolve(import.meta.dirname, '..');

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  CodeBlock: () => null,
  writeClipboard: async () => true
}));
vi.mock('../src/client/McpAppFrame.js', () => ({
  McpAppCodeBlock: () => null,
  StreamingMcpAppPlaceholder: () => null
}));
const cssModule = new Proxy({}, { get: (_target, name) => String(name) });
vi.mock('../src/client/Reader.module.css', () => ({ default: cssModule }));

const { buildGeometry, clampScale, fitSize, settleDrag, zoomAroundPoint } =
  await import('../src/client/ImageLightbox.js');

/** A geometry where the picture is larger than the viewport in both axes. */
function oversize(): Parameters<typeof settleDrag>[0]['geometry'] {
  return buildGeometry(400, 300, 2000, 1600);
}

/** A geometry where the picture fits, so it rests centred in the viewport. */
function fitting(): Parameters<typeof settleDrag>[0]['geometry'] {
  return buildGeometry(400, 300, 200, 100);
}

test('the wheel scale stays inside its range', () => {
  assert.equal(clampScale(0.1), 0.5, 'below the floor');
  assert.equal(clampScale(100), 8, 'above the ceiling');
  assert.equal(clampScale(2.5), 2.5, 'inside the range');
  assert.equal(clampScale(0.5), 0.5, 'the floor itself');
  assert.equal(clampScale(8), 8, 'the ceiling itself');
});

test('a small picture stays at its natural pixels and a large one fits the stage', () => {
  assert.deepEqual(fitSize(200, 100, 800, 600), { width: 200, height: 100 });
  // 3840×2160 into 800×600 is limited by the width: 2160 * 800/3840 = 450.
  assert.deepEqual(fitSize(3840, 2160, 800, 600), { width: 800, height: 450 });
  assert.deepEqual(fitSize(0, 100, 800, 600), { width: 0, height: 0 });
  assert.deepEqual(fitSize(Number.NaN, 100, 800, 600), { width: 0, height: 0 });
  assert.deepEqual(fitSize(320, 240, 0, 0), { width: 320, height: 240 });
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

test('dragging back out of an overshoot returns the free offset to zero', () => {
  // The pointer has already pushed 100px past the scroll start. Moving back so the
  // requested scroll is 150 leaves the picture exactly 50px into the scroll range,
  // with no leftover free offset and no jump.
  const settled = settleDrag({
    wantLeft: 150,
    wantTop: 40,
    freeX: 100,
    freeY: 10,
    release: false,
    geometry: oversize()
  });
  assert.equal(settled.left, 50);
  assert.equal(settled.top, 30);
  assert.equal(settled.freeX, 0);
  assert.equal(settled.freeY, 0);
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

test('a hard drag cannot park a large picture completely off the stage', () => {
  // The scroll already accounts for most of the travel. The free offset on release has
  // to include that scroll, or the far edge (left = maxLeft) is allowed to leave the
  // stage entirely. The sliver is 15% of the viewport, because the viewport is smaller.
  const geometry = oversize();
  assert.equal(geometry.viewWidth, 400);
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
  for (const res of [left, right]) {
    const imgLeft = geometry.restX - res.left + res.freeX;
    const imgRight = imgLeft + geometry.pictureWidth;
    assert.ok(imgRight >= 60, `picture right ${imgRight} still covers the 60px sliver`);
    assert.ok(
      imgLeft <= geometry.viewWidth - 60,
      `picture left ${imgLeft} still covers the sliver`
    );
  }
});

test('releasing an 8× picture that is already in range does not jump', () => {
  // The old bound used 15% of the picture. At 8000px that sliver is larger than the
  // viewport, the legal free range excludes 0, and a picture that has not moved snaps away.
  const geometry = buildGeometry(400, 300, 8000, 6000);
  const settled = settleDrag({
    wantLeft: 0,
    wantTop: 0,
    freeX: 0,
    freeY: 0,
    release: true,
    geometry
  });
  assert.equal(settled.left, 0);
  assert.equal(settled.top, 0);
  assert.equal(settled.freeX, 0);
  assert.equal(settled.freeY, 0);
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

/** Where the pointer sits on the picture, as fractions of the painted size. */
function pictureFractions(
  scale: number,
  scrollLeft: number,
  scrollTop: number,
  freeX: number,
  freeY: number,
  pointerX: number,
  pointerY: number,
  base: { width: number; height: number },
  view: { width: number; height: number }
): { u: number; v: number } {
  const geometry = buildGeometry(view.width, view.height, base.width * scale, base.height * scale);
  const imgLeft = geometry.restX - scrollLeft + freeX;
  const imgTop = geometry.restY - scrollTop + freeY;
  return {
    u: (pointerX - imgLeft) / (base.width * scale),
    v: (pointerY - imgTop) / (base.height * scale)
  };
}

test('zooming in and back keeps the same picture point under the pointer', () => {
  const base = { width: 800, height: 500 };
  const view = { width: 500, height: 400 };
  const pointerX = 120;
  const pointerY = 80;
  const start = { scale: 1, scrollLeft: 40, scrollTop: 20, freeX: 10, freeY: -5 };
  const before = pictureFractions(
    start.scale,
    start.scrollLeft,
    start.scrollTop,
    start.freeX,
    start.freeY,
    pointerX,
    pointerY,
    base,
    view
  );
  const zoomed = zoomAroundPoint({
    currentScale: start.scale,
    nextScale: 2,
    pointerX,
    pointerY,
    scrollLeft: start.scrollLeft,
    scrollTop: start.scrollTop,
    freeX: start.freeX,
    freeY: start.freeY,
    baseWidth: base.width,
    baseHeight: base.height,
    viewWidth: view.width,
    viewHeight: view.height
  });
  const afterIn = pictureFractions(
    2,
    zoomed.left,
    zoomed.top,
    zoomed.freeX,
    zoomed.freeY,
    pointerX,
    pointerY,
    base,
    view
  );
  assert.ok(Math.abs(afterIn.u - before.u) < 1e-6, `u drifted to ${afterIn.u} from ${before.u}`);
  assert.ok(Math.abs(afterIn.v - before.v) < 1e-6, `v drifted to ${afterIn.v} from ${before.v}`);
  const zoomedGeometry = buildGeometry(view.width, view.height, base.width * 2, base.height * 2);
  const zoomedX = zoomedGeometry.restX - zoomed.left + zoomed.freeX + before.u * base.width * 2;
  const zoomedY = zoomedGeometry.restY - zoomed.top + zoomed.freeY + before.v * base.height * 2;
  assert.ok(Math.abs(zoomedX - pointerX) < 1e-6);
  assert.ok(Math.abs(zoomedY - pointerY) < 1e-6);

  const back = zoomAroundPoint({
    currentScale: 2,
    nextScale: 1,
    pointerX,
    pointerY,
    scrollLeft: zoomed.left,
    scrollTop: zoomed.top,
    freeX: zoomed.freeX,
    freeY: zoomed.freeY,
    baseWidth: base.width,
    baseHeight: base.height,
    viewWidth: view.width,
    viewHeight: view.height
  });
  const afterOut = pictureFractions(
    1,
    back.left,
    back.top,
    back.freeX,
    back.freeY,
    pointerX,
    pointerY,
    base,
    view
  );
  assert.ok(Math.abs(afterOut.u - before.u) < 1e-6);
  assert.ok(Math.abs(afterOut.v - before.v) < 1e-6);
  const backGeometry = buildGeometry(view.width, view.height, base.width, base.height);
  const backX = backGeometry.restX - back.left + back.freeX + before.u * base.width;
  const backY = backGeometry.restY - back.top + back.freeY + before.v * base.height;
  assert.ok(Math.abs(backX - pointerX) < 1e-6);
  assert.ok(Math.abs(backY - pointerY) < 1e-6);
});

test('a zoom with no painted size centres the next picture', () => {
  const settled = zoomAroundPoint({
    currentScale: 0,
    nextScale: 1,
    pointerX: 10,
    pointerY: 10,
    scrollLeft: 0,
    scrollTop: 0,
    freeX: 0,
    freeY: 0,
    baseWidth: 0,
    baseHeight: 400,
    viewWidth: 200,
    viewHeight: 200
  });
  assert.equal(settled.freeX, 0);
  assert.equal(settled.freeY, 0);
  assert.equal(settled.left, 0);
});

test('the viewer renders one dialog and the reading view mounts it only while open', () => {
  // Two dialogs stacked was the original paging bug: `›` made the neighbour call
  // `showModal()` on its own dialog. One viewer, one dialog, and only while it is open,
  // so a closed picture leaves no hidden dialog behind and the next open starts fresh.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  const code = lightbox.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  assert.equal((code.match(/<dialog/gu) ?? []).length, 1, 'the viewer owns one dialog');
  const blocks = readFileSync(resolve(root, 'src/client/Blocks.tsx'), 'utf8');
  const blockCode = blocks.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  assert.doesNotMatch(blockCode, /<dialog/u, 'the image block renders no dialog of its own');
  assert.match(blocks, /viewerOpen && url && \(/u, 'the viewer is mounted only while open');
  assert.match(blocks, /<ImageLightbox/u, 'and uses the shared viewer');
  assert.match(blocks, /ref=\{opener\}/u, 'the triggering button is remembered');
  assert.match(blocks, /opener\.current\?\.focus\(\)/u, 'closing returns focus to that button');
});

test('the wheel listener is non-passive and preventDefault is reachable', () => {
  // A passive listener cannot stop the page from scrolling behind the dialog, which is
  // the difference between zooming and scrolling.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/u);
  assert.match(lightbox, /event\.preventDefault\(\)/u);
});

test('zoom anchors in layout, and a drag measures from where the pointer went down', () => {
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  const code = lightbox.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  assert.match(code, /writeClipboard\(caption\)/u);
  assert.match(code, /state\.startLeft - dx/u);
  assert.doesNotMatch(code, /scrollLeft - dx/u);
  assert.match(code, /hasPointerCapture/u);
  assert.doesNotMatch(code, /window\.addEventListener\(\s*'keydown'/u);
  assert.doesNotMatch(code, /setScale\(\s*(?:\([^)]*\)|\w+)\s*=>/u);
  assert.doesNotMatch(code, /autoFocus/u);
});

test('the stage scrolls and the picture is transformed, not clipped', () => {
  // A `max-width` on the img would cap zoom at whatever already fits, so the stage owns
  // the viewport box and the picture is scaled inside it.
  const css = readFileSync(resolve(root, 'src/client/Reader.module.css'), 'utf8');
  const stage = /\.imageStage\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(stage, /overflow:\s*auto/u, 'the stage scrolls');
  assert.doesNotMatch(
    stage,
    /align-items|justify-content/u,
    'the stage does not flex-center its overflow'
  );
  const openDialog = /\.imageDialog\[open\]\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(openDialog, /display:\s*flex/u);
  const closedDialog = /\.imageDialog\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.doesNotMatch(closedDialog, /display:\s*flex/u, 'a closed dialog must stay hidden');
  const inner = /\.imageStageInner\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(inner, /width:\s*max-content/u, 'the picture is laid out at its own size');
  assert.match(inner, /margin:\s*auto/u);
  const caption = /\.lightboxCaption\s*\{[^}]*\}/u.exec(css)?.[0] ?? '';
  assert.match(caption, /overflow-wrap:\s*anywhere/u);
  assert.doesNotMatch(caption, /direction:\s*rtl|unicode-bidi/u);
});

test('a click that ends a drag does not close the dialog', () => {
  // Dragging off the picture leaves a trailing click on the backdrop; without the guard
  // the viewer closes the moment the drag ends.
  const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
  assert.match(lightbox, /if \(dragged\.current\) \{/u);
  assert.match(lightbox, /Math\.abs\(dx\) \+ Math\.abs\(dy\) > 2/u);
});
