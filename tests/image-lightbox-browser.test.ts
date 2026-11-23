import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'vitest';

// The pinned Chromium is a local tool. CI that only builds the release does not have it,
// so the file skips there instead of failing. On this machine the runtime is present and
// the test has to drive a real page.
const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = existsSync(browserRuntime) ? false : 'pinned Chromium runtime not available';
const root = resolve(import.meta.dirname, '..');

interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

const overlapWidth = (image: Box, stage: Box): number =>
  Math.min(image.right, stage.right) - Math.max(image.left, stage.left);

test(
  'the image lightbox fits, zooms about the pointer, pans, and returns focus',
  { skip, timeout: 60_000 },
  async () => {
    const harnessPointer = join(homedir(), '.config/dshx/harness');
    const harness =
      process.env.DSHX_HARNESS?.trim() ||
      (existsSync(harnessPointer) ? readFileSync(harnessPointer, 'utf8').trim() : '');
    const require = createRequire(join(root, 'package.json'));
    const { build } = createRequire(require.resolve('tsx'))('esbuild');
    const webPackage = join(harness, 'packages/client/web/package.json');
    assert.equal(
      existsSync(webPackage),
      true,
      'Harness web package is required to resolve react-dom'
    );
    const webRequire = createRequire(webPackage);
    const styles: string[] = [];
    const out = mkdtempSync(join(tmpdir(), 'image-lightbox-'));
    let browser: { close(): Promise<void> } | undefined;
    let closeServer: (() => Promise<void>) | undefined;
    try {
      const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
      await build({
        entryPoints: [join(root, 'tests/fixtures/image-lightbox.tsx')],
        outfile: join(out, 'fixture.js'),
        bundle: true,
        platform: 'browser',
        format: 'esm',
        jsx: 'automatic',
        alias: {
          // One React for the fixture and for react-dom. Two copies throw on every hook.
          react: dirname(webRequire.resolve('react/package.json')),
          'react-dom': dirname(webRequire.resolve('react-dom/package.json'))
        },
        plugins: [
          {
            name: 'css-module-identity',
            setup(esbuild) {
              esbuild.onLoad({ filter: /\.module\.css$/ }, async args => {
                styles.push(await readFileSync(args.path, 'utf8'));
                return {
                  contents:
                    'export default new Proxy({}, { get: (_target, key) => String(key) });\n',
                  loader: 'js'
                };
              });
            }
          },
          {
            name: 'primitives-stub',
            setup(esbuild) {
              esbuild.onResolve({ filter: /^@deepseek-ai\/dsh-client-ui-primitives$/ }, () => ({
                path: 'dsh-client-ui-primitives',
                namespace: 'lightbox-stub'
              }));
              esbuild.onLoad({ filter: /.*/, namespace: 'lightbox-stub' }, () => ({
                contents:
                  'export function writeClipboard(text) { return Promise.resolve(text.length > 0); }\n',
                loader: 'js'
              }));
            }
          }
        ],
        logLevel: 'silent'
      });
      assert.ok(
        styles.some(sheet => sheet.includes('.imageDialog[open]')),
        'the real dialog CSS was bundled'
      );
      assert.ok(
        styles.some(sheet => sheet.includes('.imageStageInner')),
        'the stage CSS was bundled'
      );
      const server = createServer((request, response) => {
        if (request.url === '/fixture.js') {
          response.setHeader('Content-Type', 'text/javascript');
          response.end(readFileSync(join(out, 'fixture.js')));
          return;
        }
        if (request.url === '/favicon.ico') {
          response.statusCode = 204;
          response.end();
          return;
        }
        response.setHeader('Content-Type', 'text/html');
        response.end(`<!doctype html><html><head><meta charset="utf-8"><style>
          html, body { margin: 0; height: 100%; }
          ${styles.join('\n')}
        </style></head><body><div id="app"></div><script type="module" src="/fixture.js"></script></body></html>`);
      });
      await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
      closeServer = () => new Promise(resolveClose => server.close(() => resolveClose()));
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      // Headless Chromium paints classic scrollbars. They appear on the first zoom and
      // steal more than the 4px anchor budget. Overlay scrollbars, which macOS uses,
      // do not. Hiding them keeps the anchor check on the zoom math.
      browser = await launchPinnedChromium({ args: ['--hide-scrollbars'] });
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1280, height: 800 });
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(String(error)));
      page.on('console', (message: { type(): string; text(): string }) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForSelector('#open-large');

      const frames = async (): Promise<void> => {
        await page.evaluate(
          () =>
            new Promise<void>(resolveFrame =>
              requestAnimationFrame(() => requestAnimationFrame(() => resolveFrame()))
            )
        );
      };
      const readBox = async (selector: string): Promise<Box> =>
        page.evaluate(target => {
          const node = document.querySelector(target);
          if (node === null) throw new Error(`missing ${target}`);
          const box = node.getBoundingClientRect();
          return {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
            width: box.width,
            height: box.height
          };
        }, selector);
      const percent = async (): Promise<number> =>
        page.evaluate(() => {
          const button = document.querySelector('.lightboxButton');
          return Number.parseInt(button?.textContent ?? '', 10);
        });

      assert.equal(await page.evaluate(() => document.querySelectorAll('dialog').length), 0);

      await page.click('#open-large');
      await page.waitForFunction(() => {
        const stage = document.querySelector('.imageStage');
        const image = document.querySelector('.imageStage img');
        const button = document.querySelector('.lightboxButton');
        if (stage === null || image === null || button === null || button.textContent !== '100%')
          return false;
        const box = image.getBoundingClientRect();
        const view = stage.getBoundingClientRect();
        if (box.width < 100 || box.height < 100) return false;
        const dx = Math.abs((box.left + box.right) / 2 - (view.left + view.right) / 2);
        const dy = Math.abs((box.top + box.bottom) / 2 - (view.top + view.bottom) / 2);
        return (
          stage.scrollWidth <= stage.clientWidth + 1 &&
          stage.scrollHeight <= stage.clientHeight + 1 &&
          dx <= 2 &&
          dy <= 2
        );
      });
      const fitted = await page.evaluate(() => {
        const stage = document.querySelector('.imageStage');
        const image = document.querySelector('.imageStage img');
        if (stage === null || image === null) return null;
        return {
          scrollWidth: stage.scrollWidth,
          clientWidth: stage.clientWidth,
          scrollHeight: stage.scrollHeight,
          clientHeight: stage.clientHeight,
          imageWidth: image.getBoundingClientRect().width,
          imageHeight: image.getBoundingClientRect().height
        };
      });
      assert.ok(fitted !== null);
      assert.ok(
        fitted.scrollWidth <= fitted.clientWidth + 1,
        `fitted width overflow ${fitted.scrollWidth - fitted.clientWidth}`
      );
      assert.ok(
        fitted.scrollHeight <= fitted.clientHeight + 1,
        `fitted height overflow ${fitted.scrollHeight - fitted.clientHeight}`
      );
      assert.equal(await percent(), 100);

      const stageAtFit = await readBox('.imageStage');
      const pointer = {
        x: stageAtFit.left + stageAtFit.width * 0.25,
        y: stageAtFit.top + stageAtFit.height * 0.3
      };
      const beforeZoom = await page.evaluate(({ x, y }) => {
        const image = document.querySelector('.imageStage img');
        if (image === null) throw new Error('missing image');
        const box = image.getBoundingClientRect();
        return { u: (x - box.left) / box.width, v: (y - box.top) / box.height };
      }, pointer);
      await page.mouse.move(pointer.x, pointer.y);
      for (let step = 0; step < 8; step += 1) {
        await page.mouse.wheel(0, -120);
        await frames();
      }
      const zoomedPercent = await percent();
      assert.ok(zoomedPercent > 200, `expected a scale above 200%, got ${zoomedPercent}%`);
      const scrolled = await page.evaluate(() => {
        const stage = document.querySelector('.imageStage');
        if (stage === null) return null;
        return {
          wider: stage.scrollWidth > stage.clientWidth,
          taller: stage.scrollHeight > stage.clientHeight
        };
      });
      assert.deepEqual(scrolled, { wider: true, taller: true });
      const anchored = await page.evaluate(
        ({ u, v }) => {
          const image = document.querySelector('.imageStage img');
          if (image === null) throw new Error('missing image');
          const box = image.getBoundingClientRect();
          return { x: box.left + u * box.width, y: box.top + v * box.height };
        },
        { ...pointer, ...beforeZoom }
      );
      assert.ok(
        Math.abs(anchored.x - pointer.x) <= 4,
        `anchor x moved to ${anchored.x}, pointer ${pointer.x}`
      );
      assert.ok(
        Math.abs(anchored.y - pointer.y) <= 4,
        `anchor y moved to ${anchored.y}, pointer ${pointer.y}`
      );

      const beforeDrag = await readBox('.imageStage img');
      await page.mouse.move(pointer.x, pointer.y);
      await page.mouse.down();
      for (let step = 1; step <= 5; step += 1) {
        await page.mouse.move(pointer.x + 12 * step, pointer.y + 8 * step);
      }
      await page.mouse.up();
      await frames();
      const afterDrag = await readBox('.imageStage img');
      assert.ok(
        Math.abs(afterDrag.left - beforeDrag.left - 60) <= 4,
        `drag dx ${afterDrag.left - beforeDrag.left}`
      );
      assert.ok(
        Math.abs(afterDrag.top - beforeDrag.top - 40) <= 4,
        `drag dy ${afterDrag.top - beforeDrag.top}`
      );

      const shove = async (dx: number): Promise<number> => {
        await page.evaluate(distance => {
          const stage = document.querySelector('.imageStage');
          if (stage === null) throw new Error('missing stage');
          const rect = stage.getBoundingClientRect();
          const startX = rect.left + rect.width / 2;
          const startY = rect.top + rect.height / 2;
          const fire = (type: string, x: number, buttons: number): void => {
            stage.dispatchEvent(
              new PointerEvent(type, {
                bubbles: true,
                cancelable: true,
                clientX: x,
                clientY: startY,
                button: 0,
                buttons,
                pointerId: 1,
                pointerType: 'mouse',
                isPrimary: true
              })
            );
          };
          fire('pointerdown', startX, 1);
          for (let step = 1; step <= 5; step += 1)
            fire('pointermove', startX + (distance * step) / 5, 1);
          fire('pointerup', startX + distance, 0);
        }, dx);
        await frames();
        const image = await readBox('.imageStage img');
        const stage = await readBox('.imageStage');
        return overlapWidth(image, stage);
      };
      const leftOverlap = await shove(-4000);
      const stageWidth = (await readBox('.imageStage')).width;
      assert.ok(leftOverlap >= stageWidth * 0.14, `left overlap ${leftOverlap} of ${stageWidth}`);
      const rightOverlap = await shove(4000);
      assert.ok(
        rightOverlap >= stageWidth * 0.14,
        `right overlap ${rightOverlap} of ${stageWidth}`
      );

      const stageBox = await page.locator('.imageStage').boundingBox();
      const dialogBox = await page.locator('dialog').boundingBox();
      assert.ok(stageBox !== null && dialogBox !== null);
      await page.mouse.move(stageBox.x + stageBox.width / 2, stageBox.y + stageBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dialogBox.x + dialogBox.width / 2, dialogBox.y + dialogBox.height - 6, {
        steps: 6
      });
      await page.mouse.up();
      await frames();
      assert.equal(
        await page.evaluate(() => document.querySelector('dialog')?.open ?? false),
        true,
        'a drag that ends on the dialog edge must not close it'
      );
      const zoomedBeforeShortcut = await percent();
      await page.locator('.imageStage').focus();
      await page.keyboard.press('Meta+0');
      await frames();
      assert.equal(await percent(), zoomedBeforeShortcut, 'Cmd+0 must not reset the picture');
      await page.locator('.imageStage').focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(
        () => document.querySelector('.lightboxButton')?.textContent === '100%'
      );
      await frames();
      const recentred = await page.evaluate(() => {
        const stage = document.querySelector('.imageStage');
        const image = document.querySelector('.imageStage img');
        if (stage === null || image === null) return null;
        const box = image.getBoundingClientRect();
        const view = stage.getBoundingClientRect();
        return {
          dx: Math.abs((box.left + box.right) / 2 - (view.left + view.right) / 2),
          dy: Math.abs((box.top + box.bottom) / 2 - (view.top + view.bottom) / 2),
          fits:
            stage.scrollWidth <= stage.clientWidth + 1 &&
            stage.scrollHeight <= stage.clientHeight + 1
        };
      });
      assert.ok(recentred !== null && recentred.fits && recentred.dx <= 2 && recentred.dy <= 2);

      await page.locator('button[aria-label="关闭图片预览"]').focus();
      await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelectorAll('dialog').length === 0);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-large');

      await page.click('#open-small');
      await page.waitForFunction(() => {
        const image = document.querySelector('.imageStage img');
        if (image === null) return false;
        const box = image.getBoundingClientRect();
        return Math.abs(box.width - 200) <= 1 && Math.abs(box.height - 120) <= 1;
      });
      const smallBefore = await readBox('.imageStage img');
      const smallStage = await readBox('.imageStage');
      const smallStart = {
        x: smallBefore.left + smallBefore.width / 2,
        y: smallBefore.top + smallBefore.height / 2
      };
      await page.mouse.move(smallStart.x, smallStart.y);
      await page.mouse.down();
      await page.mouse.move(smallStart.x + 80, smallStart.y + 30, { steps: 4 });
      await page.mouse.up();
      await frames();
      await page.locator('.imageStage').focus();
      await page.keyboard.press('0');
      await frames();
      const smallAfter = await readBox('.imageStage img');
      assert.ok(Math.abs(smallAfter.width - 200) <= 1 && Math.abs(smallAfter.height - 120) <= 1);
      const smallDx = Math.abs(
        (smallAfter.left + smallAfter.right) / 2 - (smallStage.left + smallStage.right) / 2
      );
      const smallDy = Math.abs(
        (smallAfter.top + smallAfter.bottom) / 2 - (smallStage.top + smallStage.bottom) / 2
      );
      assert.ok(smallDx <= 2 && smallDy <= 2, `small picture off centre by ${smallDx}, ${smallDy}`);
      await page.mouse.click(8, 8);
      await page.waitForFunction(() => document.querySelectorAll('dialog').length === 0);
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'open-small');
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await closeServer?.();
      rmSync(out, { recursive: true, force: true });
    }
  }
);
