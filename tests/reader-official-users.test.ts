import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';

test('headless Reader users retain official renderers, anchors and empty-key fallback', async () => {
  const root = resolve(import.meta.dirname, '..');
  const harness = process.env.DSHX_HARNESS?.trim()
    || readFileSync(join(homedir(), '.config/dshx/harness'), 'utf8').trim();
  const require = createRequire(join(root, 'package.json'));
  const { build } = createRequire(require.resolve('tsx'))('esbuild');
  const webRequire = createRequire(join(harness, 'packages/client/web/package.json'));
  const out = mkdtempSync(join(tmpdir(), 'reader-official-users-'));
  try {
    const { launchPinnedChromium } = await import(pathToFileURL(join(homedir(), '.codex/playwright-runtime/runtime.mjs')).href);
    await build({
      entryPoints: [join(root, 'tests/fixtures/reader-official-users.tsx')],
      outfile: join(out, 'fixture.js'), bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
      alias: {
        '@fixture/registry': join(harness, 'packages/client/ui-renderer/src/client/registry.ts'),
        '@fixture/renderer': join(harness, 'packages/client/ui-renderer/src/client/scoped-slots.tsx'),
        '@deepseek-ai/dsh-client-ui-primitives': join(harness, 'packages/client/ui-primitives/src/index.ts'),
        '@deepseek-ai/dsh-client-ui-slots': join(harness, 'packages/client/ui-slots/src/index.ts'),
        react: dirname(require.resolve('react/package.json')),
        'react-dom': dirname(webRequire.resolve('react-dom/package.json')),
      },
      loader: { '.css': 'empty', '.woff2': 'empty', '.woff': 'empty', '.ttf': 'empty', '.svg': 'empty' },
      logLevel: 'silent',
    });
    const server = createServer((request, response) => {
      if (request.url === '/easyrewrite.js' && process.env.DSH_EASYREWRITE_CLIENT) {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(readFileSync(process.env.DSH_EASYREWRITE_CLIENT));
      } else if (request.url === '/fixture.js') {
        response.setHeader('Content-Type', 'text/javascript');
        response.end(readFileSync(join(out, 'fixture.js')));
      } else {
        response.setHeader('Content-Type', 'text/html');
        const easyrewrite = process.env.DSH_EASYREWRITE_CLIENT
          ? '<script>window.__ModuleLoader__={load:m=>window.easyrewriteModule=m}</script><script src="/easyrewrite.js"></script>' : '';
        response.end(`<!doctype html><div id="app"></div>${easyrewrite}<script type="module" src="/fixture.js"></script>`);
      }
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    let browser;
    try {
      browser = await launchPinnedChromium();
      const page = await browser.newPage();
      const errors: string[] = [];
      page.on('pageerror', (error: Error) => errors.push(String(error)));
      page.on('console', (message: { type(): string; text(): string }) => {
        if (message.type() === 'error') errors.push(message.text());
      });
      const address = server.address();
      assert.ok(address && typeof address === 'object');
      await page.goto(`http://127.0.0.1:${address.port}`);
      await page.waitForFunction(() => 'readerUserResult' in window, undefined, { timeout: 10000 });
      assert.equal(await page.evaluate(() => Reflect.get(window, 'readerUserResult')), 'passed');
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
});
