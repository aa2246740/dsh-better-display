import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { pngPixel } from './png-pixel.js';

const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = existsSync(browserRuntime) ? false : 'pinned Chromium runtime not available';

test('enlarged theme tokens do not let the answer heading share a lane', { skip, timeout: 15_000 }, async () => {
  const root = resolve(import.meta.dirname, '..');
  const files = new Map([
    ['/Reader.module.css', readFileSync(join(root, 'src/client/Reader.module.css'))],
    ['/MarkdownText.module.css', readFileSync(join(root, 'src/client/markdown/MarkdownText.module.css'))],
    ['/', readFileSync(join(root, 'tests/fixtures/reader-theme-overlap.html'))],
  ]);
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '/');
    if (!body) { response.statusCode = 404; response.end(); return; }
    response.setHeader('Content-Type', request.url?.endsWith('.css') ? 'text/css' : 'text/html');
    response.end(body);
  });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
  const browser = await launchPinnedChromium();
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 320 }, deviceScaleFactor: 1 });
    // The plate-colour sample below is the opaque fallback's contract. Default
    // lanes are frosted (#87, reader-lane-wallpaper.test.ts); geometry is the same.
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${address.port}/`);
    await page.waitForFunction(() => Reflect.get(window, '__themeOverlapReady') === true);
    const atRest = await page.evaluate(() => {
      const box = (selector: string) => {
        const rect = document.querySelector(selector)!.getBoundingClientRect();
        return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
      };
      const overlaps = (a: { top: number; right: number; bottom: number; left: number }, b: typeof a) =>
        a.left < b.right - 1 && a.right > b.left + 1 && a.top < b.bottom - 1 && a.bottom > b.top + 1;
      const status = box('[data-reader-lane="status"]');
      const summary = box('#summary');
      const heading = box('#heading');
      return {
        statusOverlapsSummary: overlaps(status, summary),
        headingOverlapsSummary: overlaps(heading, summary),
        headingBelowSummary: heading.top >= summary.bottom - 1,
      };
    });
    assert.equal(atRest.statusOverlapsSummary, false);
    assert.equal(atRest.headingOverlapsSummary, false);
    assert.equal(atRest.headingBelowSummary, true);

    await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('#scroll')!;
      const summary = document.querySelector('#summary')!.getBoundingClientRect();
      const heading = document.querySelector('#heading')!.getBoundingClientRect();
      scroll.scrollTop += heading.top - summary.top + 8;
    });
    const sample = await page.evaluate(() => {
      const summary = document.querySelector('#summary')!.getBoundingClientRect();
      const diff = document.querySelector('#summary .diffStatRoot')!.getBoundingClientRect();
      return { x: Math.max(summary.left + 8, diff.left - 24), y: summary.top + 2 };
    });
    const shot = await page.screenshot({
      clip: { x: sample.x, y: sample.y, width: 1, height: 1 },
      scale: 'css',
    });
    const [red, green, blue] = pngPixel(shot, 0, 0);
    assert.ok(Math.abs(red - 16) < 12 && Math.abs(green - 32) < 12 && Math.abs(blue - 64) < 12, `lane plate pixel was ${red},${green},${blue}`);

    await page.evaluate(() => {
      const scroll = document.querySelector<HTMLElement>('#scroll')!;
      scroll.scrollTop = scroll.scrollHeight;
    });
    const stuck = await page.evaluate(() => {
      const status = document.querySelector('#flow-status')!.getBoundingClientRect();
      const summary = document.querySelector('#flow-summary')!.getBoundingClientRect();
      return { statusBottom: status.bottom, summaryTop: summary.top, statusHeight: status.height };
    });
    assert.ok(stuck.statusHeight > 40, `expected the enlarged status row to exceed 40px, got ${stuck.statusHeight}`);
    assert.ok(stuck.summaryTop >= stuck.statusBottom - 1, `summary top ${stuck.summaryTop} overlaps status bottom ${stuck.statusBottom}`);
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await new Promise<void>(resolveClose => server.close(() => resolveClose()));
  }
});
