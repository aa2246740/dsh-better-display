/** Headless fixture verification; never attaches to the user's browser/Host. */
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const harness = process.env.DSHX_HARNESS;
if (!harness) throw new Error('Set DSHX_HARNESS to the target checkout.');
const root = resolve(import.meta.dirname, '..');
const require = createRequire(join(root, 'package.json'));
const esbuild = createRequire(require.resolve('tsx')).resolve('esbuild');
const { build } = await import(pathToFileURL(esbuild).href);
const browserRuntime = join(homedir(), '.codex/playwright-runtime/runtime.mjs');
const { launchPinnedChromium } = await import(pathToFileURL(browserRuntime).href);
const out = join(root, '.evidence/official-bridge');
await mkdir(out, { recursive: true });
const paths = {
  registry: 'ui-renderer/src/client/registry.ts', renderer: 'ui-renderer/src/client/scoped-slots.tsx',
  feedback: 'ui-message-feedback/src/client/index.ts', 'read-row': 'ui-tool/src/client/tool/toolviews/read-row.tsx',
  'read-image-row': 'ui-tool/src/client/tool/toolviews/read-image-row.tsx', 'tool-locale': 'ui-conversation/src/client/locales.ts',
  deliverables: 'ui-deliverables/src/client/Deliverables.tsx', 'deliverables-locale': 'ui-deliverables/src/client/locales.ts',
  'open-in-app-action': 'ui-open-in-app/src/client/FileRouteAction.tsx', 'open-in-app-locale': 'ui-open-in-app/src/client/locales.ts',
};
const webRequire = createRequire(join(harness, 'packages/client/web/package.json'));
await build({
  entryPoints: [join(root, 'tests/browser-official-bridge.tsx')], outfile: join(out, 'fixture.js'), bundle: true,
  format: 'esm', platform: 'browser', jsx: 'automatic', sourcemap: true, logLimit: 5,
  alias: {
    ...Object.fromEntries(Object.entries(paths).map(([name, path]) => [`@fixture/${name}`, join(harness, 'packages/client', path)])),
    '@deepseek-ai/dsh-client-ui-primitives': join(harness, 'packages/client/ui-primitives/src/index.ts'),
    '@deepseek-ai/dsh-client-ui-slots': join(harness, 'packages/client/ui-slots/src/index.ts'),
    react: dirname(require.resolve('react/package.json')), 'react-dom': dirname(webRequire.resolve('react-dom/package.json')),
  },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
});
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lN8AAAAASUVORK5CYII=', 'base64');
const server = createServer(async (req, res) => {
  if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="zh"><meta charset="utf-8"><link rel="stylesheet" href="/fixture.css"><style>body{font-family:system-ui;margin:24px}button{cursor:pointer}</style><div id="app"></div><script type="module" src="/fixture.js"></script></html>'); return; }
  if (req.url?.startsWith('/api/file?') || req.url === '/pixel.png') { res.setHeader('Content-Type', 'image/png'); res.end(pixel); return; }
  if (req.url?.startsWith('/api/present.open')) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify([{ id: 'preview-app', name: 'Preview App', default: true, icon: null }, { id: 'other-app', name: 'Other App', default: false, icon: null }])); return; }
  const file = req.url === '/fixture.js' ? 'fixture.js' : req.url === '/fixture.css' ? 'fixture.css' : null;
  if (!file) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/css');
  res.end(await readFile(join(out, file)));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await launchPinnedChromium();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  const errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => { errors.push(String(error)); console.error(String(error)); });
  page.on('console', msg => { if (msg.type() === 'error') { errors.push(msg.text()); console.error(msg.text().slice(0, 1200)); } });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole('button', { name: '好的回答', exact: true }).waitFor();
  assert.equal(await page.locator('[data-nested]').textContent(), 'nested official child');
  await page.getByRole('button', { name: 'Count 0' }).click();
  await page.getByRole('button', { name: 'Count 1' }).waitFor();
  await page.evaluate(() => window.fixture.update());
  await page.getByText('session-a / updated / turn-context', { exact: true }).waitFor();
  await page.evaluate(() => window.fixture.addAction());
  await page.getByRole('button', { name: 'Future official action' }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Count 1' }).count(), 1);
  assert.equal(await page.evaluate(() => window.fixture.observations.mounts), 1);
  // Uses the real official dialog/controller with in-memory Remote replies.
  await page.getByRole('button', { name: '好的回答', exact: true }).click();
  await page.getByRole('dialog').waitFor();
  await page.screenshot({ path: join(out, 'feedback-dialog.png') });
  await writeFile(join(out, 'dialog.txt'), await page.getByRole('dialog').innerText());
  const cancel = page.getByRole('button', { name: 'close', exact: true });
  await cancel.click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '好的回答', exact: true }).click();
  await page.getByRole('button', { name: '任务结果', exact: true }).click();
  await page.getByRole('textbox', { name: '反馈详情' }).fill('Local fixture only');
  await page.getByRole('button', { name: 'submit', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: '取消标记', exact: true }).waitFor();
  const put = await page.evaluate(() => window.fixture.observations.requests.find(([method]) => method === 'put')[1]);
  assert.deepEqual(put, { sessionId: 'session-a', messageId: 'message-1', rating: 'positive', note: 'Local fixture only', category: 'task-result', ifVersion: null });
  await page.getByRole('button', { name: '取消标记', exact: true }).click();
  await page.getByRole('button', { name: '好的回答', exact: true }).waitFor();
  const tool = page.locator('[data-reader-tool]');
  await tool.getByRole('button', { name: 'sample.ts', exact: true }).click();
  const open = await page.evaluate(() => window.fixture.observations.opens[0]);
  assert.deepEqual(open, { path: '/fixture/sample.ts', options: { line: 12 } });
  await tool.locator('[data-disclosure-row]').click();
  await tool.getByText('export const value = 1;', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-presented-file]').count(), 1);
  assert.equal(await page.locator('[data-produced-files-row]').count(), 0);
  await page.getByRole('button', { name: '在侧边栏预览 /fixture/report.pdf', exact: true }).click();
  assert.equal(await page.evaluate(() => window.fixture.observations.opens.at(-1).path), '/fixture/report.pdf');
  await page.getByRole('button', { name: '更多打开方式', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Other App', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => window.fixture.observations.opens.at(-1)), ['presented', 'session-a', 42, 0, 'open', 'other-app']);
  await page.evaluate(() => window.fixture.language());
  await page.getByRole('button', { name: 'Good response', exact: true }).waitFor();
  const image = page.locator('img[alt="本地样例"]');
  assert.match(await image.getAttribute('src'), /\/api\/file\?path=%2Ffixture%2Fimage.png$/);
  assert.equal(await image.evaluate(img => img.complete && img.naturalWidth > 0), true);
  await page.screenshot({ path: join(out, 'reader-controls.png') });
  await writeFile(join(out, 'tool.txt'), await page.locator('[data-reader-tool]').innerText());
  const before = await page.evaluate(() => window.fixture.observations.subscriptions);
  await page.evaluate(() => window.fixture.unmount());
  await page.locator('[data-unmounted]').waitFor();
  const after = await page.evaluate(() => window.fixture.observations.subscriptions);
  assert.ok(after < before, `subscriptions did not release (${before} → ${after})`);
  await page.evaluate(() => window.fixture.mount());
  await page.getByRole('button', { name: 'Good response', exact: true }).waitFor();
  assert.deepEqual(errors, []);
  const result = { passed: true, assertions: ['real official feedback dialog', 'feedback submit/retract through mock Remote', 'official file opener with line', 'official read detail', 'official presented file preview/menu', 'no duplicate produced row', 'memo', 'locale change', 'session injection', 'store actions', 'context hook', 'nested slots', 'new official registration', 'stable mount', 'subscription cleanup', 'Reader remount', 'local image'], observations: await page.evaluate(() => window.fixture.observations) };
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
}
