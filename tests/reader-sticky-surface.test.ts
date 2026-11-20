import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';
import { pngPixel } from './png-pixel.js';

const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = existsSync(browserRuntime) ? false : 'pinned Chromium runtime not available';
const root = resolve(import.meta.dirname, '..');
const shots = '/tmp/issue-66-sticky-lanes';

function dist(a: number[], b: number[]) {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

type Rgb = [number, number, number];

function laneHtml(cssName: string, options: {
  scheme: 'dark' | 'light';
  base: string;
  layer: string;
  label: string;
  delta: number;
  fontSize: number;
  glass?: boolean;
}) {
  const glass = options.glass ? ' data-reader-glass=""' : '';
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <link rel="stylesheet" href="/${cssName}">
  <style>
    :root {
      color-scheme: ${options.scheme};
      --dsh-content-font-size: ${options.fontSize}px;
      --dsh-content-font-delta: ${options.delta}px;
      --dsw-alias-bg-base: ${options.base};
      --dsw-alias-bg-layer-1: ${options.layer};
      --dsw-alias-label-primary: ${options.label};
      --dsw-alias-label-secondary: ${options.label};
      --dsw-alias-label-tertiary: ${options.label};
      --dsw-font-family: ui-sans-serif, sans-serif;
    }
    html, body { margin: 0; background: #ff00aa; color-scheme: ${options.scheme}; }
    .scroll { height: 280px; overflow: auto; background: #ff00aa; }
    #heading { margin: 0; background: #00e5ff; color: #ff4ad2; font: 700 48px/52px sans-serif; }
    #canvas-probe { position: fixed; right: 8px; bottom: 8px; width: 12px; height: 12px; background: Canvas; }
  </style>
</head>
<body>
  <div id="canvas-probe"></div>
  <div class="scroll" id="scroll">
    <div class="root"${glass} data-dsh-better-display="fixture">
      <div class="column" data-chat-flow="">
        <div class="toolbar" data-reader-lane="toolbar"><button class="textButton" type="button">自动折叠开</button></div>
        <section class="turn" data-reader-turn="1">
          <div class="turnStickyRegion">
            <div class="turnStickyLanes">
              <div class="turnProcessSticky" data-reader-lane="status">
                <button class="disclosureButton" type="button"><span class="statusText">用时 64 分 24 秒</span></button>
              </div>
              <div class="closedProcessSummary" id="summary">
                <div class="summaryRow">
                  <button class="disclosureButton" type="button"><span class="foldSummary">思考×79 · 输出×15</span></button>
                </div>
              </div>
            </div>
            <div class="answer">
              <h2 id="heading">核心对比核心对比核心对比核心对比</h2>
              <div style="height:900px"></div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <script>window.__ready = true;</script>
</body>
</html>`;
}

async function listen(files: Map<string, Buffer | string>) {
  const server = createServer((request, response) => {
    const body = files.get(request.url ?? '/');
    if (body === undefined) { response.statusCode = 404; response.end(); return; }
    response.setHeader('Content-Type', request.url?.endsWith('.css') ? 'text/css' : request.url?.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(body);
  });
  await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  return {
    port: address.port,
    close: () => new Promise<void>(resolveClose => server.close(() => resolveClose())),
  };
}

async function sample(page: { screenshot(options: { clip: { x: number; y: number; width: number; height: number }; scale: 'css' }): Promise<Buffer> }, x: number, y: number): Promise<Rgb> {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 }, scale: 'css' });
  const [red, green, blue] = pngPixel(shot, 0, 0);
  return [red, green, blue];
}

async function reduceTransparency(page: { context(): { newCDPSession(page: unknown): Promise<{ send(method: string, params: object): Promise<unknown> }> } }) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
}

// The opaque Canvas-backed plate (#66) is the lane surface when the reader
// prefers reduced transparency or the browser has no backdrop-filter. The
// default frosted lanes (#87) are covered in reader-lane-wallpaper.test.ts.
test('transparent and faded theme tokens keep lane pixels on the page surface (opaque fallback)', { skip, timeout: 30_000 }, async () => {
  const css = readFileSync(join(root, 'src/client/Reader.module.css'));
  const files = new Map<string, Buffer | string>([['/reader.css', css]]);
  const cases = [
    { name: 'dark-22-clear', scheme: 'dark' as const, base: 'transparent', layer: 'transparent', label: '#f5f7fa', delta: 8, fontSize: 22, limit: 16 },
    { name: 'light-22-clear', scheme: 'light' as const, base: 'transparent', layer: 'transparent', label: '#141414', delta: 8, fontSize: 22, limit: 16 },
    { name: 'dark-22-fade', scheme: 'dark' as const, base: 'rgb(255 255 255 / 10%)', layer: 'rgb(255 255 255 / 10%)', label: '#f5f7fa', delta: 8, fontSize: 22, limit: 100 },
    { name: 'light-22-fade', scheme: 'light' as const, base: 'rgb(255 255 255 / 10%)', layer: 'rgb(255 255 255 / 10%)', label: '#141414', delta: 8, fontSize: 22, limit: 100 },
    { name: 'floor-12', scheme: 'dark' as const, base: 'transparent', layer: 'transparent', label: '#f5f7fa', delta: -2, fontSize: 12, limit: 16 },
  ];
  for (const item of cases) files.set(`/${item.name}.html`, laneHtml('reader.css', item));
  const server = await listen(files);
  const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
  const browser = await launchPinnedChromium();
  mkdirSync(shots, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 360 }, deviceScaleFactor: 1 });
    await reduceTransparency(page);
    const errors: string[] = [];
    page.on('pageerror', (error: Error) => errors.push(String(error)));
    for (const item of cases) {
      await page.goto(`http://127.0.0.1:${server.port}/${item.name}.html`);
      await page.waitForFunction(() => Reflect.get(window, '__ready') === true);
      const box = await page.evaluate(() => {
        const rect = (selector: string) => {
          const itemRect = document.querySelector(selector)!.getBoundingClientRect();
          return { top: itemRect.top, right: itemRect.right, bottom: itemRect.bottom, left: itemRect.left, height: itemRect.height };
        };
        return { toolbar: rect('.toolbar'), status: rect('[data-reader-lane="status"]'), summary: rect('#summary'), probe: rect('#canvas-probe') };
      });
      if (item.fontSize === 12) {
        assert.ok(box.toolbar.height >= 40, `${item.name} toolbar ${box.toolbar.height}px is under the 40px floor`);
        assert.ok(box.status.height >= 40, `${item.name} status ${box.status.height}px is under the 40px floor`);
      } else {
        assert.ok(box.status.height > 44, `${item.name} status ${box.status.height}px did not grow with the 22px content font`);
      }
      await page.evaluate(() => {
        const scroll = document.querySelector<HTMLElement>('#scroll')!;
        const summary = document.querySelector('#summary')!.getBoundingClientRect();
        const heading = document.querySelector('#heading')!.getBoundingClientRect();
        scroll.scrollTop += heading.top - summary.top;
      });
      const points = await page.evaluate(() => {
        const summary = document.querySelector('#summary')!.getBoundingClientRect();
        const status = document.querySelector('[data-reader-lane="status"]')!.getBoundingClientRect();
        const probe = document.querySelector('#canvas-probe')!.getBoundingClientRect();
        return {
          summary: { x: summary.left + 10, y: summary.top + 2 },
          status: { x: status.right - 12, y: status.top + 2 },
          probe: { x: probe.left + 2, y: probe.top + 2 },
        };
      });
      const canvas = await sample(page, points.probe.x, points.probe.y);
      const summary = await sample(page, points.summary.x, points.summary.y);
      const status = await sample(page, points.status.x, points.status.y);
      const text = item.scheme === 'dark' ? [245, 247, 250] : [20, 20, 20];
      const glyph: Rgb = [255, 74, 210];
      const wash: Rgb = [0, 229, 255];
      const pageTone: Rgb = [255, 0, 170];
      await page.screenshot({ path: join(shots, `${item.name}.png`) });
      for (const [place, pixel] of [['summary', summary], ['status', status]] as const) {
        const message = `${item.name} ${place} pixel ${pixel.join(',')} canvas ${canvas.join(',')} text ${text.join(',')}`;
        assert.ok(dist(pixel, canvas) <= item.limit, message);
        assert.ok(dist(pixel, canvas) + 40 < dist(pixel, text), message);
        assert.ok(dist(pixel, glyph) > 80, message);
        assert.ok(dist(pixel, wash) > 80, message);
        assert.ok(dist(pixel, pageTone) > 80, message);
      }
    }
    assert.deepEqual(errors, []);
  } finally {
    await browser.close();
    await server.close();
  }
});

// Stock lanes keep main's opaque plate in the fallback; default-mode stock is
// checked at rest against the token in reader-lane-wallpaper.test.ts. Glass
// mode is compared in the default media state, where #87 must not touch it.
test('stock (opaque fallback) and glass lanes stay pixel-identical to origin/main', { skip, timeout: 30_000 }, async () => {
  const headCss = readFileSync(join(root, 'src/client/Reader.module.css'));
  const mainCss = execFileSync('git', ['show', 'origin/main:src/client/Reader.module.css'], { cwd: root });
  const files = new Map<string, Buffer | string>([
    ['/head.css', headCss],
    ['/main.css', mainCss],
    ['/stock-head.html', laneHtml('head.css', { scheme: 'light', base: '#223344', layer: '#aabbcc', label: '#f5f7fa', delta: 0, fontSize: 14 })],
    ['/stock-main.html', laneHtml('main.css', { scheme: 'light', base: '#223344', layer: '#aabbcc', label: '#f5f7fa', delta: 0, fontSize: 14 })],
    ['/glass-head.html', laneHtml('head.css', { scheme: 'light', base: '#223344', layer: '#aabbcc', label: '#f5f7fa', delta: 0, fontSize: 14, glass: true })],
    ['/glass-main.html', laneHtml('main.css', { scheme: 'light', base: '#223344', layer: '#aabbcc', label: '#f5f7fa', delta: 0, fontSize: 14, glass: true })],
  ]);
  const server = await listen(files);
  const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
  const browser = await launchPinnedChromium();
  mkdirSync(shots, { recursive: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 360 }, deviceScaleFactor: 1 });
    const glassPage = await browser.newPage({ viewport: { width: 1000, height: 360 }, deviceScaleFactor: 1 });
    await reduceTransparency(page);
    const read = async (path: string, target = page) => {
      await target.goto(`http://127.0.0.1:${server.port}${path}`);
      await target.waitForFunction(() => Reflect.get(window, '__ready') === true);
      const points = await target.evaluate(() => {
        const summary = document.querySelector('#summary')!.getBoundingClientRect();
        const toolbar = document.querySelector('.toolbar')!.getBoundingClientRect();
        return {
          lane: { x: summary.left + 12, y: summary.top + 2 },
          gap: { x: summary.left + 12, y: summary.top - 4 },
          toolbar: { x: toolbar.left + 8, y: toolbar.top + 4 },
        };
      });
      return {
        lane: await sample(target, points.lane.x, points.lane.y),
        gap: await sample(target, points.gap.x, points.gap.y),
        toolbar: await sample(target, points.toolbar.x, points.toolbar.y),
      };
    };
    const stockHead = await read('/stock-head.html');
    await page.screenshot({ path: join(shots, 'stock-head.png') });
    const stockMain = await read('/stock-main.html');
    await page.screenshot({ path: join(shots, 'stock-main.png') });
    const glassHead = await read('/glass-head.html', glassPage);
    await glassPage.screenshot({ path: join(shots, 'glass-head.png') });
    const glassMain = await read('/glass-main.html', glassPage);
    await glassPage.screenshot({ path: join(shots, 'glass-main.png') });
    for (const place of ['lane', 'gap', 'toolbar'] as const) {
      assert.ok(dist(stockHead[place], stockMain[place]) <= 2, `stock ${place} head ${stockHead[place].join(',')} main ${stockMain[place].join(',')}`);
      assert.ok(dist(stockHead[place], [34, 51, 68]) <= 2, `stock ${place} left the opaque token: ${stockHead[place].join(',')}`);
      assert.ok(dist(glassHead[place], glassMain[place]) <= 8, `glass ${place} head ${glassHead[place].join(',')} main ${glassMain[place].join(',')}`);
      assert.ok(dist(glassHead[place], [255, 0, 170]) <= 12, `glass ${place} painted a plate: ${glassHead[place].join(',')}`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
});

test('each Reader root owns its lane height and the floor is 40px', { skip, timeout: 30_000 }, async () => {
  const harnessPointer = join(homedir(), '.config/dshx/harness');
  const harness = process.env.DSHX_HARNESS?.trim()
    || (existsSync(harnessPointer) ? readFileSync(harnessPointer, 'utf8').trim() : '');
  assert.ok(harness, 'DSH Harness source not available');
  const require = createRequire(join(root, 'package.json'));
  const { build } = createRequire(require.resolve('tsx'))('esbuild');
  const webRequire = createRequire(join(harness, 'packages/client/web/package.json'));
  const out = mkdtempSync(join(tmpdir(), 'reader-lane-owners-'));
  try {
    await build({
      entryPoints: [join(root, 'tests/fixtures/reader-lane-owners.tsx')],
      outfile: join(out, 'fixture.js'),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      jsx: 'automatic',
      alias: {
        react: dirnameOf(require.resolve('react/package.json')),
        'react-dom': dirnameOf(webRequire.resolve('react-dom/package.json')),
      },
      logLevel: 'silent',
    });
    const server = await listen(new Map<string, Buffer | string>([
      ['/fixture.js', readFileSync(join(out, 'fixture.js'))],
      ['/', '<!doctype html><div id="app"></div><script type="module" src="/fixture.js"></script>'],
    ]));
    const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
    const browser = await launchPinnedChromium();
    try {
      const page = await browser.newPage({ viewport: { width: 800, height: 600 }, deviceScaleFactor: 1 });
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(String(error)));
      await page.goto(`http://127.0.0.1:${server.port}/`);
      await page.waitForSelector('#row-a');
      await page.click('#grow');
      await page.waitForFunction(() => {
        const row = document.querySelector('#row-a');
        return !!row && row.getBoundingClientRect().height >= 86;
      });
      await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
      const grown = await page.evaluate(() => ({
        published: document.querySelector<HTMLElement>('#turn-a')!.style.getPropertyValue('--reader-summary-height'),
        actual: document.querySelector('#row-a')!.getBoundingClientRect().height,
        other: document.querySelector<HTMLElement>('#turn-b')!.style.getPropertyValue('--reader-summary-height'),
        short: document.querySelector<HTMLElement>('#turn-short')!.style.getPropertyValue('--reader-status-height'),
        toolbar: Number.parseFloat(document.querySelector<HTMLElement>('#root-toolbar')!.style.getPropertyValue('--reader-toolbar-height')),
        status: Number.parseFloat(document.querySelector<HTMLElement>('#turn-status')!.style.getPropertyValue('--reader-status-height')),
      }));
      assert.equal(grown.actual, 86, `row a measured ${grown.actual}`);
      assert.equal(grown.published, '86px', `reader A kept a stale lane height ${grown.published} for an 86px row`);
      assert.equal(grown.other, '52px', `reader B lane height changed to ${grown.other}`);
      assert.equal(grown.short, '40px', `38px row published ${grown.short}`);
      assert.ok(grown.toolbar >= 40, `toolbar lane published ${grown.toolbar}`);
      assert.ok(grown.status >= 40, `status lane published ${grown.status}`);
      await page.click('#drop');
      await page.waitForFunction(() => document.querySelector('#row-a') === null);
      await page.evaluate(() => new Promise(resolveFrame => requestAnimationFrame(() => requestAnimationFrame(resolveFrame))));
      const dropped = await page.evaluate(() => ({
        published: document.querySelector<HTMLElement>('#turn-a')!.style.getPropertyValue('--reader-summary-height'),
        other: document.querySelector<HTMLElement>('#turn-b')!.style.getPropertyValue('--reader-summary-height'),
      }));
      assert.equal(dropped.published, '', `unmounted reader A left ${dropped.published}`);
      assert.equal(dropped.other, '52px', `unmounting reader A cleared reader B (${dropped.other})`);
      assert.deepEqual(errors, []);
      await page.screenshot({ path: join(shots, 'two-roots.png') });
    } finally {
      await browser.close();
      await server.close();
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});

function dirnameOf(file: string) {
  return file.slice(0, file.lastIndexOf('/'));
}
