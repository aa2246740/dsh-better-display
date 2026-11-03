import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { test } from 'vitest';

const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = existsSync(browserRuntime) ? false : 'pinned Chromium runtime not available';

function paeth(left: number, up: number, upLeft: number) {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const diagonal = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= diagonal) return left;
  if (upDistance <= diagonal) return up;
  return upLeft;
}

function pngPixel(buffer: Buffer, x: number, y: number) {
  let offset = 8;
  const chunks: Buffer[] = [];
  let width = 0;
  let height = 0;
  let colorType = 0;
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      colorType = data[9] ?? 0;
    } else if (type === 'IDAT') chunks.push(data);
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  const bytesPerPixel = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * bytesPerPixel;
  let source = 0;
  let previous = Buffer.alloc(stride);
  const rows: Buffer[] = [];
  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = raw[source] ?? 0;
    source += 1;
    const row = Buffer.alloc(stride);
    for (let index = 0; index < stride; index += 1) {
      const value = raw[source] ?? 0;
      source += 1;
      const left = index >= bytesPerPixel ? row[index - bytesPerPixel] ?? 0 : 0;
      const up = previous[index] ?? 0;
      const upLeft = index >= bytesPerPixel ? previous[index - bytesPerPixel] ?? 0 : 0;
      let decoded = value;
      if (filter === 1) decoded = value + left;
      else if (filter === 2) decoded = value + up;
      else if (filter === 3) decoded = value + Math.floor((left + up) / 2);
      else if (filter === 4) decoded = value + paeth(left, up, upLeft);
      else if (filter !== 0) throw new Error(`unsupported png filter ${filter}`);
      row[index] = decoded & 255;
    }
    rows.push(row);
    previous = row;
  }
  const pixel = rows[y];
  const start = x * bytesPerPixel;
  return [pixel?.[start] ?? 0, pixel?.[start + 1] ?? 0, pixel?.[start + 2] ?? 0];
}

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
