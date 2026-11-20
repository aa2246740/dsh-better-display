import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { pngRow, type Rgb } from './png-pixel.js';

// #87. A wallpaper theme keeps --dsw-alias-bg-base an opaque near-black and
// paints its wallpaper behind a transparent conversation column. The default
// (non-glass) sticky lanes painted that token as a solid band. They must let
// the wallpaper through, keep text that scrolls beneath illegible, keep their
// own label legible, look unchanged on a plain theme at rest, and fall back to
// the opaque plate under prefers-reduced-transparency.

const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = existsSync(browserRuntime) ? false : 'pinned Chromium runtime not available';
const root = resolve(import.meta.dirname, '..');

const dist = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const channel = (value: number) => {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const luminance = ([r, g, b]: Rgb) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (a: Rgb, b: Rgb) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};
const spread = (pixels: Rgb[]) =>
  Math.max(...pixels.map(luminance)) - Math.min(...pixels.map(luminance));

interface Theme {
  scheme: 'dark' | 'light';
  base: string;
  layer: string;
  label: string;
  page: string;
  glyph: string;
}

const RED: Rgb = [208, 32, 32];
const BLUE: Rgb = [32, 64, 208];
const WALLPAPER = `repeating-linear-gradient(90deg, rgb(${RED.join(' ')}) 0 60px, rgb(${BLUE.join(' ')}) 60px 120px)`;

function html(theme: Theme) {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><link rel="stylesheet" href="/reader.css">
<style>
  :root { color-scheme: ${theme.scheme}; --dsw-alias-bg-base: ${theme.base}; --dsw-alias-bg-layer-1: ${theme.layer};
    --dsw-alias-label-primary: ${theme.label}; --dsw-alias-label-secondary: ${theme.label}; --dsw-alias-label-tertiary: ${theme.label};
    --dsw-font-family: ui-sans-serif, sans-serif; }
  html, body { margin: 0; background: ${theme.page}; }
  .scroll { height: 300px; overflow: auto; background: transparent; }
  #heading { margin: 0; color: ${theme.glyph}; font: 700 44px/52px sans-serif; letter-spacing: 2px; }
</style></head>
<body><div class="scroll" id="scroll"><div class="root" data-dsh-better-display="fixture"><div class="column" data-chat-flow="">
  <div class="toolbar" data-reader-lane="toolbar"><button class="textButton" type="button">自动折叠开</button></div>
  <section class="turn" data-reader-turn="1"><div class="turnStickyRegion">
    <div class="turnStickyLanes">
      <div class="turnProcessSticky" data-reader-lane="status"><button class="disclosureButton" type="button"><span class="statusText">用时 1 分 4 秒</span></button></div>
      <div class="closedProcessSummary" id="summary"><div class="summaryRow"><button class="disclosureButton" type="button"><span class="foldSummary">思考×3 · 工具×2</span></button></div></div>
    </div>
    <div class="answer"><h2 id="heading">IIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIIII</h2><div style="height:900px"></div></div>
  </div></section>
</div></div></div><script>window.__ready = true;</script></body></html>`;
}

const THEMES: Record<string, Theme> = {
  // The #87 report: opaque near-black token over a wallpaper.
  wallpaper: {
    scheme: 'dark',
    base: '#101114',
    layer: '#1a1b1f',
    label: '#f5f7fa',
    page: WALLPAPER,
    glyph: '#ffffff'
  },
  // Plain themes: the column is the token colour.
  light: {
    scheme: 'light',
    base: '#ffffff',
    layer: '#f5f5f7',
    label: '#141414',
    page: '#ffffff',
    glyph: '#000000'
  },
  dark: {
    scheme: 'dark',
    base: '#16171a',
    layer: '#202125',
    label: '#f5f7fa',
    page: '#16171a',
    glyph: '#ffffff'
  },
  // #66: a theme that clears the token. The Canvas floor is the only surface.
  cleared: {
    scheme: 'dark',
    base: 'transparent',
    layer: 'transparent',
    label: '#f5f7fa',
    page: '#3a5a7a',
    glyph: '#ffffff'
  }
};

test(
  'default lanes show the wallpaper, hide text beneath, and keep plain themes unchanged',
  { skip, timeout: 40_000 },
  async () => {
    const files = new Map<string, Buffer | string>([
      ['/reader.css', readFileSync(join(root, 'src/client/Reader.module.css'))]
    ]);
    for (const [name, theme] of Object.entries(THEMES)) files.set(`/${name}.html`, html(theme));
    const server = createServer((request, response) => {
      const body = files.get(request.url ?? '/');
      if (body === undefined) {
        response.statusCode = 404;
        response.end();
        return;
      }
      response.setHeader('Content-Type', request.url?.endsWith('.css') ? 'text/css' : 'text/html');
      response.end(body);
    });
    await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
    const address = server.address();
    assert.ok(address && typeof address === 'object');
    const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
    const browser = await launchPinnedChromium();
    try {
      const page = await browser.newPage({
        viewport: { width: 1000, height: 340 },
        deviceScaleFactor: 1
      });
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(String(error)));
      const cdp = await page.context().newCDPSession(page);
      const reduce = (on: boolean) =>
        cdp.send('Emulation.setEmulatedMedia', {
          features: [
            { name: 'prefers-reduced-transparency', value: on ? 'reduce' : 'no-preference' }
          ]
        });
      const line = async (x: number, y: number, width: number): Promise<Rgb[]> =>
        pngRow(
          await page.screenshot({
            clip: { x: Math.round(x), y: Math.round(y), width, height: 1 },
            scale: 'css'
          })
        );
      const open = async (name: string) => {
        await page.goto(`http://127.0.0.1:${address.port}/${name}.html`);
        await page.waitForFunction(() => Reflect.get(window, '__ready') === true);
      };
      // Lane rows at rest: the toolbar and the summary, right of their labels, across one red and one blue stripe.
      const restRows = async () => {
        const at = await page.evaluate(() => {
          const toolbar = document.querySelector('.toolbar')!.getBoundingClientRect();
          const summary = document.querySelector('#summary')!.getBoundingClientRect();
          return { toolbar: toolbar.top + 4, summary: summary.top + 3, left: summary.left };
        });
        return {
          toolbar: await line(at.left, at.toolbar, 240),
          summary: await line(at.left + 240, at.summary, 240)
        };
      };
      // Scroll the heading's glyph band under the summary lane, and read the same band once outside it.
      const glyphRows = async () => {
        const outside = await page.evaluate(() => {
          const heading = document.querySelector('#heading')!.getBoundingClientRect();
          return { x: heading.left, y: heading.top + heading.height / 2 };
        });
        const reference = await line(outside.x, outside.y, 300);
        await page.evaluate(() => {
          const scroll = document.querySelector<HTMLElement>('#scroll')!;
          const summary = document.querySelector('#summary')!.getBoundingClientRect();
          const heading = document.querySelector('#heading')!.getBoundingClientRect();
          scroll.scrollTop += heading.top + heading.height / 2 - (summary.top + summary.height / 2);
        });
        const inside = await page.evaluate(() => {
          const summary = document.querySelector('#summary')!.getBoundingClientRect();
          const heading = document.querySelector('#heading')!.getBoundingClientRect();
          return {
            x: heading.left,
            y: summary.top + summary.height / 2,
            covered: heading.top < summary.bottom && heading.bottom > summary.top
          };
        });
        assert.ok(inside.covered, 'the heading sits under the summary lane');
        return { reference, beneath: await line(inside.x + 160, inside.y, 140) };
      };

      await reduce(false);
      await open('wallpaper');
      const wall = await restRows();
      for (const [place, row] of Object.entries(wall)) {
        const overRed = row[30]!;
        const overBlue = row[90]!;
        const message = `wallpaper ${place} over red ${overRed.join(',')} over blue ${overBlue.join(',')}`;
        // Not one solid band: the stripes show through.
        assert.ok(dist(overRed, overBlue) > 25, message);
        // Still a lane surface, not the bare wallpaper.
        assert.ok(dist(overRed, RED) > 80 && dist(overBlue, BLUE) > 80, message);
        // The lane label stays legible on either stripe.
        for (const pixel of [overRed, overBlue])
          assert.ok(
            contrast(pixel, [245, 247, 250]) >= 4.5,
            `${message} label contrast ${contrast(pixel, [245, 247, 250]).toFixed(2)}`
          );
      }

      for (const name of ['light', 'dark'] as const) {
        await open(name);
        const theme = THEMES[name]!;
        const token: Rgb = theme.base === '#ffffff' ? [255, 255, 255] : [22, 23, 26];
        const rest = await restRows();
        for (const [place, row] of Object.entries(rest)) {
          for (const pixel of [row[30]!, row[90]!])
            assert.ok(
              dist(pixel, token) <= 3,
              `${name} ${place} at rest ${pixel.join(',')} vs token ${token.join(',')}`
            );
        }
        const { reference, beneath } = await glyphRows();
        // The glyph band is readable outside the lane and flat under it.
        assert.ok(
          spread(reference) > 0.5,
          `${name} reference glyph spread ${spread(reference).toFixed(3)}`
        );
        assert.ok(
          spread(beneath) < 0.06,
          `${name} text under the lane is legible: spread ${spread(beneath).toFixed(3)}`
        );
      }

      await open('cleared');
      {
        const rest = await restRows();
        for (const pixel of [rest.summary[30]!, rest.toolbar[30]!])
          assert.ok(
            contrast(pixel, [245, 247, 250]) >= 4.5,
            `cleared label contrast ${contrast(pixel, [245, 247, 250]).toFixed(2)} on ${pixel.join(',')}`
          );
        const { reference, beneath } = await glyphRows();
        assert.ok(
          spread(reference) > 0.5,
          `cleared reference glyph spread ${spread(reference).toFixed(3)}`
        );
        assert.ok(
          spread(beneath) < 0.06,
          `cleared text under the lane is legible: spread ${spread(beneath).toFixed(3)}`
        );
      }

      // Reduced transparency: the opaque plate comes back, one solid colour across the stripes.
      await reduce(true);
      await open('wallpaper');
      const plate = await restRows();
      for (const [place, row] of Object.entries(plate)) {
        assert.ok(
          dist(row[30]!, row[90]!) <= 2,
          `reduced transparency ${place} ${row[30]!.join(',')} vs ${row[90]!.join(',')}`
        );
        assert.ok(
          dist(row[30]!, [16, 17, 20]) <= 3,
          `reduced transparency ${place} left the token: ${row[30]!.join(',')}`
        );
      }
      // Glass mode is its own look and does not pick up the default wash.
      await reduce(false);
      await page.goto(`http://127.0.0.1:${address.port}/wallpaper.html`);
      await page.evaluate(() => {
        document.querySelector('.root')!.setAttribute('data-reader-glass', '');
      });
      const glass = await page.evaluate(
        () => getComputedStyle(document.querySelector('#summary')!).backdropFilter
      );
      assert.equal(glass, 'none');
      assert.deepEqual(errors, []);
    } finally {
      await browser.close();
      await new Promise<void>(done => server.close(() => done()));
    }
  }
);
