import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

/**
 * Two image surfaces need the same viewer:
 *
 *  - a picture produced by a tool call ({@link ImageBlock} in Blocks.tsx)
 *  - a picture inside a final answer (`MarkdownImage` in markdown/render.tsx)
 *
 * Before this, only the first could be opened at all, and neither could be
 * zoomed. Both now render `ImageLightbox`, so the behaviour cannot drift.
 *
 * These assertions pin the wiring and the zoom contract; the feel of the wheel
 * has to be checked by hand in the running app.
 */
const root = resolve(import.meta.dirname, '..');
const lightbox = readFileSync(resolve(root, 'src/client/ImageLightbox.tsx'), 'utf8');
const blocks = readFileSync(resolve(root, 'src/client/Blocks.tsx'), 'utf8');
const render = readFileSync(resolve(root, 'src/client/markdown/render.tsx'), 'utf8');
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

test('both image surfaces render the same viewer', () => {
  // Read by component name, not by surrounding formatting: Prettier is free to
  // re-wrap the JSX.
  assert.ok(blocks.includes('<ImageLightbox'), 'the tool-call attachment uses the viewer');
  assert.ok(blocks.includes("from './ImageLightbox.js'"), 'and imports it');
  assert.ok(render.includes('<ImageLightbox'), 'a picture inside an answer uses it too');
  assert.ok(render.includes("from '../ImageLightbox.js'"), 'and imports it');
  // Neither keeps its own dialog, which is how the two surfaces drifted apart.
  assert.doesNotMatch(blocks, /<dialog/u);
  assert.doesNotMatch(render, /<dialog/u);
});

test('the wheel zooms instead of scrolling the page behind the dialog', () => {
  // The listener must be non-passive; React's `onWheel` is passive and would let
  // the page scroll while the picture zoomed.
  assert.match(lightbox, /addEventListener\('wheel', onWheel, \{ passive: false \}\)/u);
  assert.match(lightbox, /event\.preventDefault\(\)/u);
  // Wheel-driven scale is exponential, so a notch feels the same at any zoom.
  assert.match(lightbox, /Math\.exp\(-event\.deltaY \* WHEEL_FACTOR\)/u);
});

test('zoom keeps the point under the cursor still', () => {
  // The anchor is recorded in content pixels before the size changes and applied
  // in a layout effect after it, so the picture does not visibly jump.
  assert.match(lightbox, /contentX: \(node\.scrollLeft \+ viewX\) \/ scale/u);
  assert.match(lightbox, /useLayoutEffect/u);
  assert.match(lightbox, /node\.scrollLeft = anchor\.contentX \* scale - anchor\.viewX/u);
});

test('zoom is clamped and can always be reset to 100%', () => {
  assert.match(lightbox, /const MIN_SCALE = 0\.5/u);
  assert.match(lightbox, /const MAX_SCALE = 8/u);
  assert.match(lightbox, /Math\.min\(MAX_SCALE, Math\.max\(MIN_SCALE, value\)\)/u);
  // Reset is reachable three ways: the toolbar button, the 0 / space keys, and a
  // double click while already zoomed.
  assert.match(lightbox, /title="重置为 100%（按空格）"/u);
  assert.match(lightbox, /RESET_KEYS = new Set\(\['0', ' '\]\)/u);
});

test('the current scale is shown and announced', () => {
  assert.match(lightbox, /aria-live="polite"/u);
  assert.match(lightbox, /data-reader-image-scale/u);
  assert.match(lightbox, /Math\.round\(scale \* 100\)/u);
});

test('oversized pictures scroll and drag at any zoom, including 100%', () => {
  // Panning is not gated on the zoom level or on a measurement: a picture wider
  // or taller than the viewport must pan at 100% too, and the first open must
  // work before any re-measure happens.
  assert.doesNotMatch(lightbox, /if \(!pannable\) return;/u);
  assert.doesNotMatch(lightbox, /if \(scale <= 1\) return;/u);
  // The stage really scrolls, so native scrollbars show where in the picture the
  // reader is, and dragging moves the scroll offset instead of a transform.
  assert.match(rule('.imageStage'), /overflow:\s*auto/u);
  assert.match(lightbox, /node\.scrollLeft = start\.left - \(event\.clientX - start\.x\)/u);
  assert.match(lightbox, /node\.scrollTop = start\.top - \(event\.clientY - start\.y\)/u);
  // A transform would hide the overflow with nothing to reveal it.
  assert.doesNotMatch(rule('.imageStageInner img'), /transform:/u);
});

test('a picture that fits is centred on both axes, a larger one is not clipped', () => {
  // Centring must live on the inner wrapper: `align-items: center` on the scroll
  // container itself clips the overflow at the start edge and makes it
  // unreachable.
  const inner = rule('.imageStageInner');
  assert.match(inner, /display:\s*flex/u);
  assert.match(inner, /align-items:\s*center/u);
  assert.match(inner, /justify-content:\s*center/u);
  // `min-width`/`min-height` 100% let it fill the viewport so a smaller picture
  // centres, while `max-content` lets a larger one extend and scroll.
  assert.match(inner, /width:\s*max-content/u);
  assert.match(inner, /min-width:\s*100%/u);
  assert.match(inner, /min-height:\s*100%/u);
  assert.doesNotMatch(rule('.imageStage'), /align-items:\s*center/u);
});

test('a picture inside a link keeps navigating instead of opening the viewer', () => {
  assert.match(render, /zoomable=\{context\.inLink !== true\}/u);
  assert.match(render, /if \(!zoomable\) return picture/u);
});

test('the trigger is a button, so the viewer opens from the keyboard', () => {
  // A real button is what makes Tab + Enter work; closing returns focus to it.
  assert.match(lightbox, /aria-label=\{label\}/u);
  assert.match(lightbox, /onClick=\{showTrigger\}/u);
  assert.match(lightbox, /trigger\.current\?\.focus\(\)/u);
});
