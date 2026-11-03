import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { transform } from 'lightningcss';
import { test } from 'vitest';
import { OFFICIAL_SEATS, OFFICIAL_SLOTS } from '../src/client/official-slots.js';

// Width is a layout fact of the real Reader and the host user/steering renderer.
// This skips in CI, which has no pinned Chromium and no Harness tree.
const harnessPointer = join(homedir(), '.config/dshx/harness');
const harness = process.env.DSHX_HARNESS?.trim()
  || (existsSync(harnessPointer) ? readFileSync(harnessPointer, 'utf8').trim() : '');
const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const skip = !harness ? 'DSH Harness source not available'
  : !existsSync(browserRuntime) ? 'pinned Chromium runtime not available' : false;

interface Box { w: number; h: number; font: string; line: string }
interface Row {
  name: string;
  user: Box; steering: Box; pending: Box;
  nativeUser: Box; nativeSteering: Box;
  readerHtml: string;
}
interface BubbleResult {
  error?: string;
  readerSlot?: string;
  nativeSlot?: string;
  rows?: Row[];
}

test('reader user and steering bubbles match the host column cap', { skip, timeout: 120_000 }, async () => {
  const root = resolve(import.meta.dirname, '..');
  const require = createRequire(join(root, 'package.json'));
  const { build } = createRequire(require.resolve('tsx'))('esbuild');
  const webRequire = createRequire(join(harness, 'packages/client/web/package.json'));
  const out = mkdtempSync(join(tmpdir(), 'reader-user-bubble-'));
  const cssParts: string[] = [];
  try {
    const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
    await build({
      entryPoints: [join(root, 'tests/fixtures/reader-user-bubble.tsx')],
      outfile: join(out, 'fixture.js'), bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
      alias: {
        '@fixture/registry': join(harness, 'packages/client/ui-renderer/src/client/registry.ts'),
        '@fixture/renderer': join(harness, 'packages/client/ui-renderer/src/client/scoped-slots.tsx'),
        '@fixture/user-message': join(harness, 'packages/client/ui-chat/src/client/chat/MessageItem.tsx'),
        '@fixture/user-content': join(harness, 'packages/client/ui-chat/src/client/chat/UserContent.tsx'),
        '@deepseek-ai/dsh-client-ui-primitives': join(harness, 'packages/client/ui-primitives/src/index.ts'),
        '@deepseek-ai/dsh-client-ui-slots': join(harness, 'packages/client/ui-slots/src/index.ts'),
        '@deepseek-ai/dsh-client-store': join(harness, 'packages/client/store/src/index.ts'),
        react: dirname(require.resolve('react/package.json')),
        'react-dom': dirname(webRequire.resolve('react-dom/package.json')),
      },
      loader: { '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.png': 'empty', '.jpg': 'empty', '.webp': 'empty' },
      plugins: [{
        name: 'css-modules',
        setup(build: { onLoad: Function; onEnd: Function }) {
          build.onLoad({ filter: /\.module\.css$/ }, (args: { path: string }) => {
            const result = transform({ filename: args.path, code: readFileSync(args.path), cssModules: { pattern: 't[hash]_[local]' } });
            const mapping: Record<string, string> = {};
            for (const [key, value] of Object.entries(result.exports ?? {})) mapping[key] = value.name;
            cssParts.push(Buffer.from(result.code).toString('utf8'));
            return { contents: `export default ${JSON.stringify(mapping)};`, loader: 'js' };
          });
          build.onLoad({ filter: /\.css$/ }, (args: { path: string }) => {
            cssParts.push(readFileSync(args.path, 'utf8'));
            return { contents: 'export default {};', loader: 'js' };
          });
          build.onLoad({ filter: /\.svg$/ }, () => ({ contents: 'export default function Svg(){return null}', loader: 'js' }));
          build.onEnd(() => { writeFileSync(join(out, 'fixture.css'), cssParts.join('\n')); });
        },
      }],
      logLevel: 'silent',
    });
    const server = createServer((request, response) => {
      if (request.url === '/fixture.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(readFileSync(join(out, 'fixture.js')));
      } else if (request.url === '/fixture.css') {
        response.setHeader('Content-Type', 'text/css');
        response.end(readFileSync(join(out, 'fixture.css')));
      } else {
        response.setHeader('Content-Type', 'text/html');
        response.end('<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>html,body{margin:0;font-family:"PingFang SC","Hiragino Sans GB",sans-serif}</style><div id="app"></div><script type="module" src="/fixture.js"></script>');
      }
    });
    await new Promise<void>(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
    let browser;
    try {
      browser = await launchPinnedChromium();
      const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(String(error)));
      page.on('console', (message: { type(): string; text(): string }) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(() => 'readerBubbleResult' in window, undefined, { timeout: 20000 });
      const result = await page.evaluate(() => Reflect.get(window, 'readerBubbleResult')) as BubbleResult;
      assert.equal(result.error, undefined, result.error);
      assert.deepEqual(errors, []);
      assert.equal(result.readerSlot, OFFICIAL_SEATS.nodes);
      assert.equal(result.nativeSlot, OFFICIAL_SLOTS.nodes);
      assert.notEqual(result.readerSlot, 'conversation.chat.node');
      for (const row of result.rows ?? []) {
        assert.equal(row.user.w, row.nativeUser.w, `${row.name} user width ${row.user.w} != ${row.nativeUser.w} ${row.readerHtml}`);
        assert.equal(row.user.h, row.nativeUser.h, `${row.name} user height`);
        assert.equal(row.steering.w, row.nativeSteering.w, `${row.name} steering width`);
        assert.equal(row.steering.h, row.nativeSteering.h, `${row.name} steering height`);
        assert.equal(row.pending.w, row.nativeUser.w, `${row.name} pending width`);
        assert.equal(row.pending.h, row.nativeUser.h, `${row.name} pending height`);
        assert.equal(row.pending.font, '14px', `${row.name} pending font`);
        assert.equal(row.pending.line, '22px', `${row.name} pending line`);
        assert.equal(row.nativeUser.font, '14px', `${row.name} native font`);
        assert.equal(row.nativeUser.line, '22px', `${row.name} native line`);
      }
      const byName = Object.fromEntries((result.rows ?? []).map(row => [row.name, row]));
      assert.ok(byName.short.user.h < 50, 'a four-glyph message stays on one line');
      assert.ok(byName.short.user.w < 160, 'a four-glyph message stays content-sized');
      assert.ok(byName.thirty.user.h < 50, 'thirty glyphs fit on one line at the default column');
      assert.ok(Math.abs(byName.long.user.w - 748 * 0.702) < 1, 'the default cap follows 748 * 0.702');
      assert.ok(byName['wide-axis'].user.w > 540, 'a wider content axis is not stuck at 525px');
      assert.ok(Math.abs(byName.narrow.user.w - 480 * 0.82) < 1, 'a narrow column uses 82% of the column');
      assert.ok(byName.short.steering.h < 50, 'a short steering message stays on one line');
    } finally {
      await browser?.close();
      await new Promise<void>(resolveClose => server.close(() => resolveClose()));
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
