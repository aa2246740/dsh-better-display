#!/usr/bin/env node
/**
 * Real-Reader browser regression for the "process report narration" (正文) contract.
 *
 * Contract under test:
 *   - Body blocks (assistant text/image/other segments) are ALWAYS visible.
 *   - Fold disclosures (top 展开思考与过程 / 本轮过程详情, live fold, ClosedProcessSummary)
 *     may only contain reasoning / tool-call / other process records — never body.
 *   - Expanding the top disclosure reveals folded reasoning/tool in source order
 *     between the body articles; collapsing it keeps the body visible.
 *
 * Usage:
 *   node scripts/verify-commentary-visible.mjs --mode=red     # on a pristine (unfixed) checkout
 *   node scripts/verify-commentary-visible.mjs --mode=green   # on the fixed checkout
 *
 * `red` asserts the bug is reproducible (body folded away). `green` asserts the
 * full contract. Both build tests/browser-commentary.tsx with esbuild (from the
 * tsdown dependency tree), serve it over a local HTTP server and drive the real
 * Reader component with Playwright.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const args = new Map(process.argv.slice(2).map(argument => {
  const [key, ...rest] = argument.replace(/^--/u, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const mode = args.get('mode') ?? 'green';
if (mode !== 'red' && mode !== 'green') throw new Error(`Unknown --mode=${mode}`);
const reducedMotion = args.get('motion') ?? 'reduce';

const texts = {
  bodyA: '过程汇报正文A', reasonA: '历史思考：先查简报素材', finalB: '最终回答B', reasonB: '第二次思考：整理结论',
  bodyC: '进行中汇报正文C', reasonC0: '第一轮思考', reasonC1: '第二轮思考',
  bodyD: '失败轮正文D', reasonD: '报错前的思考', bodyE: '中断轮正文E', reasonE: '中断前的思考',
  bodyF: '第一段汇报：', bodyG: '补充汇报：', finalH: '最终回答H', reasonF0: '汇报前的思考', reasonG: '补充说明前的思考',
  toolCallId: 'call-read-1',
};

// --- dependency plumbing ---------------------------------------------------
const require = createRequire(join(root, 'package.json'));
const { build } = await import(pathToFileURL(createRequire(require.resolve('tsx')).resolve('esbuild')).href);

function firstExisting(candidates) {
  for (const candidate of candidates) if (candidate && existsSync(candidate)) return candidate;
  return undefined;
}

/** Locate the Harness pnpm virtual store that carries the runtime deps the
 *  published @deepseek-ai client packages leave external (zustand, immer, shiki…). */
function locateHarnessPnpm() {
  const candidates = [
    process.env.DSH_PNPM_DIR,
    process.env.DSHX_HARNESS ? join(process.env.DSHX_HARNESS, 'node_modules/.pnpm') : undefined,
    join(homedir(), 'deepseek-harness/node_modules/.pnpm'),
    join(root, '../deepseek-harness/node_modules/.pnpm'),
    join(process.cwd(), 'deepseek-harness/node_modules/.pnpm'),
  ];
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const entries = readdirSync(candidate);
    if (entries.some(entry => entry.startsWith('react-dom@')) && entries.some(entry => entry.startsWith('zustand@'))) return candidate;
  }
  return undefined;
}

/** Pick the package directory inside a pnpm virtual store, scoped or not. */
function pnpmPackage(pnpmDir, name) {
  const flat = name.replace('/', '+');
  const entries = readdirSync(pnpmDir).filter(entry => entry.startsWith(`${flat}@`)).sort();
  for (const entry of entries) {
    const target = join(pnpmDir, entry, 'node_modules', name);
    if (existsSync(target)) return target;
  }
  throw new Error(`Cannot locate ${name} in Harness pnpm store ${pnpmDir}`);
}

const pnpmDir = locateHarnessPnpm();
if (!pnpmDir) throw new Error('Cannot locate a Harness node_modules/.pnpm store for client runtime deps. Set DSH_PNPM_DIR.');

const outDir = join(root, '.evidence/commentary');
const depsDir = join(outDir, `deps-${mode}`);
await rm(depsDir, { recursive: true, force: true });
await mkdir(join(depsDir, 'node_modules/@shikijs'), { recursive: true });
const sharedDeps = {
  'react-dom': pnpmPackage(pnpmDir, 'react-dom'),
  zustand: pnpmPackage(pnpmDir, 'zustand'),
  immer: pnpmPackage(pnpmDir, 'immer'),
  shiki: pnpmPackage(pnpmDir, 'shiki'),
  '@shikijs/langs': pnpmPackage(pnpmDir, '@shikijs/langs'),
  anser: pnpmPackage(pnpmDir, 'anser'),
  diff: pnpmPackage(pnpmDir, 'diff'),
};
for (const [name, target] of Object.entries(sharedDeps)) symlinkSync(target, join(depsDir, 'node_modules', name));

// The published primitives bundle imports two leaf modules the desktop app
// injects at runtime; a minimal stub is enough for rendering and keeps the
// fixture hermetic (icons / language detection are not under test).
const stubs = {
  'simple-icons': 'export const siAliexpress={},siApple={},siBaidu={},siBilibili={},siCsdn={},siDuckduckgo={},siEbay={},siFacebook={},siGithub={},siGitlab={},siGoogle={},siInstagram={},siJuejin={},siMdnwebdocs={},siNetflix={},siNpm={},siPypi={},siQq={},siQuora={},siReddit={},siSinaweibo={},siSpotify={},siStackoverflow={},siTaobao={},siTelegram={},siTiktok={},siV2ex={},siWechat={},siWhatsapp={},siWikipedia={},siX={},siYcombinator={},siYoutube={},siZhihu={};',
  '@deepseek-ai/dsh-util-code-language': 'export const CODE_HIGHLIGHT_EXTENSIONS=[];export function languageForPath(){return undefined;}',
};
const stubPlugin = {
  name: 'commentary-fixture-stubs',
  setup(buildContext) {
    buildContext.onResolve({ filter: /^(simple-icons|@deepseek-ai\/dsh-util-code-language)$/ }, argument => ({ path: argument.path, namespace: 'commentary-stub' }));
    buildContext.onLoad({ filter: /.*/, namespace: 'commentary-stub' }, argument => ({ contents: stubs[argument.path], loader: 'js' }));
  },
};

await build({
  entryPoints: [join(root, 'tests/browser-commentary.tsx')],
  outfile: join(outDir, 'fixture.js'),
  bundle: true, platform: 'browser', format: 'esm', jsx: 'automatic',
  alias: { react: dirname(require.resolve('react/package.json')) },
  nodePaths: [join(depsDir, 'node_modules')],
  plugins: [stubPlugin],
  define: { 'process.env.NODE_ENV': '"production"' },
  loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl', '.svg': 'dataurl' },
  logLevel: 'warning',
});

// --- local server ----------------------------------------------------------
const server = createServer(async (request, response) => {
  const url = request.url ?? '/';
  if (url === '/fixture.js' || url === '/fixture.css') {
    response.setHeader('Content-Type', url.endsWith('.js') ? 'text/javascript' : 'text/css');
    response.end(await readFile(join(outDir, url.slice(1))));
    return;
  }
  if (url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  if (url !== '/') { response.writeHead(404); response.end(); return; }
  response.setHeader('Content-Type', 'text/html; charset=utf-8');
  response.end(`<!doctype html><html lang="zh"><meta charset="utf-8"><title>commentary fixture</title>
<link rel="stylesheet" href="/fixture.css">
<style>body{margin:0;font:14px/1.6 system-ui;--dsw-alias-label-primary:#222;--dsw-alias-label-secondary:#666;--dsw-alias-label-tertiary:#888;--dsw-alias-bg-base:#fff;--dsw-alias-border-l2:#ddd}button{cursor:pointer}.evidence-outline{outline:1px solid #f0f0f0}</style>
<div id="app"></div><script type="module" src="/fixture.js"></script></html>`);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}/`;

// --- playwright ------------------------------------------------------------
function loadPlaywright() {
  const resolved = (() => {
    try { return require.resolve('playwright'); } catch { /* try playwright-core */ }
    try { return require.resolve('playwright-core'); } catch { /* fall through to explicit paths */ }
    return undefined;
  })();
  const candidates = [
    process.env.PLAYWRIGHT_MODULE,
    resolved,
    join(homedir(), '.dsh/profiles/desktop/node_modules/playwright'),
    join(homedir(), '.dsh/profiles/desktop/node_modules/playwright-core'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!existsSync(candidate) && !existsSync(join(String(candidate), 'index.js'))) continue;
    try {
      const loader = createRequire(join(String(candidate), 'index.js'));
      return loader(String(candidate));
    } catch { /* try next */ }
  }
  throw new Error('Playwright is not installed. Set PLAYWRIGHT_MODULE to a playwright/playwright-core directory.');
}
const playwright = loadPlaywright();
const chromium = playwright.chromium;

async function launchChromium() {
  const attempts = [
    { channel: 'chrome', headless: true },
    { headless: true },
  ];
  let lastError;
  for (const options of attempts) {
    try { return await chromium.launch(options); } catch (error) { lastError = error; }
  }
  throw new Error(`Cannot launch Chromium/Chrome: ${lastError?.message ?? lastError}`);
}

// --- assertion helpers -----------------------------------------------------
const failures = [];
const checks = [];
let page;
let errors = [];

async function check(name, body) {
  try {
    await body();
    checks.push({ name, passed: true });
    console.log(`PASS ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message.split('\n')[0] : String(error);
    checks.push({ name, passed: false, error: message });
    failures.push({ name, error: message });
    console.log(`FAIL ${name}\n      ${message}`);
  }
}

function visibleMatches(locator) {
  return locator.evaluateAll(elements => elements.map(element => {
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0
      && element.getClientRects().length > 0;
  }).filter(Boolean).length);
}

async function expectVisible(locator, label, minimum = 1) {
  const visible = await visibleMatches(locator);
  assert.ok(visible >= minimum, `${label}: expected >=${minimum} visible, got ${visible} (matches ${await locator.count()})`);
}

async function expectHidden(locator, label) {
  const visible = await visibleMatches(locator);
  assert.equal(visible, 0, `${label}: expected 0 visible, got ${visible} (matches ${await locator.count()})`);
}

async function expectCount(locator, expected, label) {
  assert.equal(await locator.count(), expected, `${label}: expected ${expected} matches, got ${await locator.count()}`);
}

async function top(locator, label) {
  const element = locator.first();
  await element.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  return element.evaluate(node => Math.round(node.getBoundingClientRect().top + window.scrollY));
}

async function expectOrder(locators) {
  let previous;
  const seen = [];
  for (const { locator, label } of locators) {
    const value = await top(locator, label);
    seen.push(`${label}@${value}`);
    if (previous !== undefined && !(value > previous.value)) {
      throw new Error(`source order violated: ${label}@${value} is not after ${previous.label}@${previous.value} (${seen.join(' < ')})`);
    }
    previous = { value, label };
  }
}

async function domSnapshot() {
  return page.evaluate(() => {
    const section = element => {
      if (!element) return null;
      return {
        turn: element.getAttribute('data-reader-turn'),
        state: element.getAttribute('data-reader-turn-state'),
        result: element.getAttribute('data-reader-turn-result'),
        text: (element.innerText ?? '').replace(/\n+/gu, ' | ').slice(0, 700),
        bodies: [...element.querySelectorAll('[data-reader-body]')].map(node => (node.textContent ?? '').trim().slice(0, 80)),
        seams: element.querySelectorAll('[data-reader-process-seam]').length,
        answers: [...element.querySelectorAll('[data-reader-answer]')].map(node => (node.textContent ?? '').trim().slice(0, 80)),
        process: [...element.querySelectorAll('[data-reader-process]')].map(node => (node.textContent ?? '').trim().slice(0, 80)),
        tools: [...element.querySelectorAll('[data-reader-tool-call]')].map(node => node.getAttribute('data-reader-tool-call')),
        closedSummary: element.querySelector('[data-reader-closed-summary]')?.getAttribute('data-reader-closed-summary') ?? null,
        liveFolds: [...element.querySelectorAll('[data-reader-live-fold]')].map(node => node.getAttribute('data-reader-live-fold-summary')),
        expandButtons: [...element.querySelectorAll('button[aria-label]')]
          .map(node => node.getAttribute('aria-label'))
          .filter(label => label && /^(展开|收起)/u.test(label)),
      };
    };
    const rootNode = document.querySelector('[data-reader-build]');
    return {
      build: rootNode?.getAttribute('data-reader-build') ?? null,
      autoFold: rootNode?.getAttribute('data-reader-auto-fold') ?? null,
      turns: [...document.querySelectorAll('[data-reader-turn]')].map(section),
    };
  });
}

async function screenshot(name, locator) {
  const path = join(outDir, mode, `${name}.png`);
  await mkdir(dirname(path), { recursive: true });
  // Viewport screenshots keep the real chrome (sticky status lane, fold rows)
  // in the evidence; scroll the turn of interest into view first.
  if (locator) {
    await locator.first().evaluate(element => element.scrollIntoView({ block: 'center', behavior: 'instant' })).catch(() => {});
    await page.waitForTimeout(120);
  }
  await page.screenshot({ path });
  return path;
}

function git(args_) {
  try { return execFileSync('git', ['-C', root, ...args_], { encoding: 'utf8' }).trim(); } catch { return null; }
}

const sourceFiles = ['src/client/Reader.tsx', 'src/client/live-turn.ts', 'src/client/projection.ts'];
async function sourceHashes() {
  const hashes = {};
  for (const file of sourceFiles) {
    try { hashes[file] = createHash('md5').update(await readFile(join(root, file))).digest('hex'); }
    catch { hashes[file] = null; }
  }
  return hashes;
}

// --- run -------------------------------------------------------------------
const browser = await launchChromium();
const shots = [];
const result = {
  mode, root, url, startedAt: new Date().toISOString(),
  git: { commit: git(['rev-parse', 'HEAD']), branch: git(['rev-parse', '--abbrev-ref', 'HEAD']), tags: git(['tag', '--points-at', 'HEAD']), status: git(['status', '--porcelain']) },
  sourceHashes: await sourceHashes(),
  checks, failures, snapshots: {}, shots,
};
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 1100 }, reducedMotion });
  page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(String(error)));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  await page.goto(url);
  await page.getByRole('button', { name: '自动折叠开', exact: true }).waitFor();
  await page.waitForTimeout(250);

  const turn1 = page.locator('[data-reader-turn="1"]');
  const turn2 = page.locator('[data-reader-turn="2"]');
  const turn3 = page.locator('[data-reader-turn="3"]');
  const turn4 = page.locator('[data-reader-turn="4"]');
  const turn5 = page.locator('[data-reader-turn="5"]');
  const bodyA = () => turn1.getByText(texts.bodyA, { exact: true });
  const reasonA = () => turn1.getByText(texts.reasonA, { exact: true });
  const finalB = () => turn1.getByText(texts.finalB, { exact: true });
  const reasonB = () => turn1.getByText(texts.reasonB, { exact: true });
  const bodyC = () => turn2.getByText(texts.bodyC, { exact: true });
  const reasonC0 = () => turn2.getByText(texts.reasonC0, { exact: true });
  const reasonC1 = () => turn2.getByText(texts.reasonC1, { exact: true });
  const toolCall = () => turn1.locator(`[data-reader-tool-call="${texts.toolCallId}"]`);
  const toggleOff = async () => {
    await page.getByRole('button', { name: '自动折叠开', exact: true }).click();
    await page.getByRole('button', { name: '自动折叠关', exact: true }).waitFor();
  };
  const toggleOn = async () => {
    await page.getByRole('button', { name: '自动折叠关', exact: true }).click();
    await page.getByRole('button', { name: '自动折叠开', exact: true }).waitFor();
  };

  if (mode === 'red') {
    // Record the baseline under test; the red/green difference is behavioral.
    await check('red baseline identified (auto-fold on)', async () => {
      const snapshot = await domSnapshot();
      result.snapshots.initial = snapshot;
      assert.ok(snapshot.build, 'data-reader-build marker missing');
      assert.equal(snapshot.autoFold, 'on');
      console.log(`      baseline build marker: ${snapshot.build}`);
    });

    await check('fixture sanity: completed turn final answer is visible', async () => {
      await expectVisible(finalB(), '最终回答B');
    });

    await check('RED completed turn: 正文A is folded away before expanding', async () => {
      await expectHidden(bodyA(), '过程汇报正文A');
      assert.equal(await bodyA().count(), 0, `正文A should not be mounted at all (count ${await bodyA().count()})`);
      shots.push(await screenshot('red-completed-collapsed', turn1));
    });

    await check('RED completed turn: 正文A appears INSIDE the process disclosure after expanding', async () => {
      await turn1.getByRole('button', { name: /^展开(思考与过程|本轮过程详情)$/u }).first().click();
      await expectVisible(bodyA(), '过程汇报正文A after expand');
      const inProcess = await turn1.locator('[data-reader-process]').getByText(texts.bodyA, { exact: true }).count();
      assert.ok(inProcess >= 1, `正文A was expected to be rendered inside [data-reader-process], count=${inProcess}`);
      result.snapshots.redExpanded = await domSnapshot();
      shots.push(await screenshot('red-completed-expanded-body-in-process', turn1));
    });

    await check('RED open turn: 正文C is folded into the live fold before expanding', async () => {
      await expectHidden(bodyC(), '进行中汇报正文C');
      const folds = turn2.locator('[data-reader-live-fold]');
      const foldCount = await folds.count();
      assert.ok(foldCount >= 1, `expected a live fold in the open turn, got ${foldCount}`);
      const summary = await folds.first().getAttribute('data-reader-live-fold-summary');
      result.snapshots.redLiveFoldSummary = summary;
      assert.match(summary ?? '', /输出×1/u, `live fold summary should count the narration as folded body: ${summary}`);
      shots.push(await screenshot('red-open-live-folded', turn2));
    });

    await check('RED open turn: expanding the live fold reveals 正文C (as a folded member)', async () => {
      await turn2.getByRole('button', { name: '展开此前步骤', exact: true }).click();
      await expectVisible(bodyC(), '进行中汇报正文C after expanding prior steps');
      result.snapshots.redOpenExpanded = await domSnapshot();
      shots.push(await screenshot('red-open-fold-expanded', turn2));
    });
  } else {
    // ===================== green contract =====================
    await check('fixed build identified (auto-fold on)', async () => {
      const snapshot = await domSnapshot();
      result.snapshots.initial = snapshot;
      assert.ok(snapshot.build, 'data-reader-build marker missing');
      assert.equal(snapshot.autoFold, 'on');
      console.log(`      fixed build marker: ${snapshot.build}`);
    });

    await check('a1 completed/collapsed: 正文A visible without expanding, unique, and NOT inside a fold', async () => {
      await expectVisible(bodyA(), '过程汇报正文A');
      await expectCount(bodyA(), 1, '过程汇报正文A');
      await expectVisible(finalB(), '最终回答B');
      const closed = turn1.locator('[data-reader-closed-summary]');
      await expectCount(closed, 1, 'ClosedProcessSummary');
      await expectVisible(closed, 'ClosedProcessSummary');
      const summary = await closed.getAttribute('data-reader-closed-summary');
      assert.ok(!/正文/u.test(summary ?? ''), `ClosedProcessSummary must not hold body: ${summary}`);
      assert.equal(await closed.getByText(texts.bodyA, { exact: true }).count(), 0, '正文A leaked into ClosedProcessSummary');
      assert.equal(await turn1.locator('[data-reader-live-fold]').getByText(texts.bodyA, { exact: true }).count(), 0, '正文A leaked into live fold');
      assert.equal(await turn1.locator('[data-reader-process]').getByText(texts.bodyA, { exact: true }).count(), 0, '正文A leaked into a process disclosure');
      result.snapshots.completedCollapsed = await domSnapshot();
      shots.push(await screenshot('green-completed-collapsed', turn1));
    });

    await check('a2 completed/collapsed: reasoning and tool rows are hidden by default', async () => {
      await expectHidden(reasonA(), '历史思考');
      await expectHidden(reasonB(), '第二次思考');
      await expectHidden(toolCall(), 'tool row');
    });

    await check('a3 top disclosure expands: reasoning/tool visible, in source order between the body articles', async () => {
      const disclosure = turn1.getByRole('button', { name: /^展开(思考与过程|本轮过程详情)$/u });
      assert.ok(await disclosure.count() >= 1, 'no 展开思考与过程/展开本轮过程详情 button found');
      await disclosure.first().click();
      await expectVisible(reasonA(), '历史思考 after expand');
      await expectVisible(reasonB(), '第二次思考 after expand');
      await expectVisible(toolCall(), 'tool row after expand');
      await expectVisible(bodyA(), '过程汇报正文A after expand');
      await expectCount(bodyA(), 1, '过程汇报正文A');
      await expectVisible(finalB(), '最终回答B after expand');
      assert.equal(await turn1.locator('[data-reader-process]').getByText(texts.bodyA, { exact: true }).count(), 0, '正文A leaked into a process disclosure after expand');
      await expectOrder([
        { locator: reasonA(), label: '历史思考' },
        { locator: bodyA(), label: '过程汇报正文A' },
        { locator: toolCall(), label: 'tool row' },
        { locator: reasonB(), label: '第二次思考' },
        { locator: finalB(), label: '最终回答B' },
      ]);
      result.snapshots.completedExpanded = await domSnapshot();
      shots.push(await screenshot('green-completed-expanded', turn1));
    });

    await check('a4 collapsing again removes reasoning/tool but keeps 正文A', async () => {
      const disclosure = turn1.getByRole('button', { name: /^收起(思考与过程|本轮过程详情)$/u });
      assert.ok(await disclosure.count() >= 1, 'no 收起思考与过程/收起本轮过程详情 button found');
      await disclosure.first().click();
      await expectHidden(reasonA(), '历史思考 after collapse');
      await expectHidden(toolCall(), 'tool row after collapse');
      await expectVisible(bodyA(), '过程汇报正文A after collapse');
      await expectCount(bodyA(), 1, '过程汇报正文A');
      await expectVisible(finalB(), '最终回答B after collapse');
      result.snapshots.completedCollapsedAgain = await domSnapshot();
      shots.push(await screenshot('green-completed-collapsed-again', turn1));
    });

    await check('b1 open turn: 正文C not hidden by the live fold when the 2nd reasoning arrives', async () => {
      await expectVisible(bodyC(), '进行中汇报正文C');
      await expectCount(bodyC(), 1, '进行中汇报正文C');
      await expectVisible(reasonC1(), '第二轮思考');
      assert.equal(await turn2.locator('[data-reader-process]').getByText(texts.bodyC, { exact: true }).count(), 0, '正文C leaked into a process disclosure');
      const folds = turn2.locator('[data-reader-live-fold]');
      const foldCount = await folds.count();
      result.snapshots.openTurnFoldCount = foldCount;
      if (foldCount > 0) {
        const summary = await folds.first().getAttribute('data-reader-live-fold-summary');
        assert.ok(!/输出/u.test(summary ?? '') && !/正文/u.test(summary ?? ''), `live fold must not fold body: ${summary}`);
        assert.equal(await folds.getByText(texts.bodyC, { exact: true }).count(), 0, '正文C leaked into a live fold');
        await turn2.getByRole('button', { name: '展开此前步骤', exact: true }).click();
        await expectVisible(reasonC0(), '第一轮思考 after expanding prior steps');
        await expectVisible(bodyC(), '进行中汇报正文C after expanding prior steps');
        await expectCount(bodyC(), 1, '进行中汇报正文C');
        await expectOrder([
          { locator: reasonC0(), label: '第一轮思考' },
          { locator: bodyC(), label: '进行中汇报正文C' },
          { locator: reasonC1(), label: '第二轮思考' },
        ]);
        shots.push(await screenshot('green-open-prior-steps-expanded'));
        await turn2.getByRole('button', { name: '收起此前步骤', exact: true }).click();
        await expectHidden(reasonC0(), '第一轮思考 after collapsing prior steps');
        await expectVisible(bodyC(), '进行中汇报正文C after collapsing prior steps');
      } else {
        await expectVisible(reasonC0(), '第一轮思考');
        await expectOrder([
          { locator: reasonC0(), label: '第一轮思考' },
          { locator: bodyC(), label: '进行中汇报正文C' },
          { locator: reasonC1(), label: '第二轮思考' },
        ]);
      }
      result.snapshots.openTurn = await domSnapshot();
      shots.push(await screenshot('green-open-turn', turn2));
    });

    await check('c1 auto-fold off: completed turn shows body and all process content', async () => {
      await toggleOff();
      await expectVisible(bodyA(), '过程汇报正文A with auto-fold off');
      await expectCount(bodyA(), 1, '过程汇报正文A');
      await expectVisible(reasonA(), '历史思考 with auto-fold off');
      await expectVisible(reasonB(), '第二次思考 with auto-fold off');
      await expectVisible(toolCall(), 'tool row with auto-fold off');
      await expectVisible(finalB(), '最终回答B with auto-fold off');
      await expectVisible(bodyC(), '进行中汇报正文C with auto-fold off');
      await expectVisible(reasonC0(), '第一轮思考 with auto-fold off');
      result.snapshots.autoFoldOff = await domSnapshot();
      shots.push(await screenshot('green-auto-fold-off', turn1));
    });

    await check('c2 auto-fold restored: completed turn folds reasoning again, body stays', async () => {
      await toggleOn();
      await page.waitForTimeout(120);
      await expectVisible(bodyA(), '过程汇报正文A after restoring auto-fold');
      await expectHidden(reasonA(), '历史思考 after restoring auto-fold');
    });

    await check('d1 failed turn: body and reasoning both visible without expanding', async () => {
      await expectVisible(turn3.getByText(texts.bodyD, { exact: true }), '失败轮正文D');
      await expectCount(turn3.getByText(texts.bodyD, { exact: true }), 1, '失败轮正文D');
      await expectVisible(turn3.getByText(texts.reasonD, { exact: true }), '报错前的思考');
      await expectVisible(turn3.getByText('本轮未完成；错误信息保留在下方。', { exact: true }), 'terminal notice');
      shots.push(await screenshot('green-failed-turn', turn3));
    });

    await check('d2 interrupted turn: body and reasoning both visible without expanding', async () => {
      await expectVisible(turn4.getByText(texts.bodyE, { exact: true }), '中断轮正文E');
      await expectCount(turn4.getByText(texts.bodyE, { exact: true }), 1, '中断轮正文E');
      await expectVisible(turn4.getByText(texts.reasonE, { exact: true }), '中断前的思考');
      shots.push(await screenshot('green-interrupted-turn', turn4));
    });

    await check('e1 body stays plain prose; the process seam sits between collapsed report paragraphs', async () => {
      const bodyF = () => turn5.getByText(texts.bodyF, { exact: false });
      const bodyG = () => turn5.getByText(texts.bodyG, { exact: false });
      await expectVisible(bodyF(), '第一段汇报');
      await expectVisible(bodyG(), '补充汇报');
      await expectVisible(turn5.getByText(texts.finalH, { exact: true }), '最终回答H');
      await expectHidden(turn5.getByText(texts.reasonF0, { exact: true }), '汇报前的思考');
      await expectHidden(turn5.getByText(texts.reasonG, { exact: true }), '补充说明前的思考');

      // All narration blocks are ordinary body prose: no annotation styling and
      // no left rule of their own.
      const bodies = turn5.locator('[data-reader-body]');
      assert.equal(await bodies.count(), 3, `expected three body blocks in turn 5, got ${await bodies.count()}`);
      const bodyBoxes = await bodies.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return {
          top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, left: rect.left + window.scrollX,
          borderLeftWidth: style.borderLeftWidth, fontSize: style.fontSize, color: style.color,
        };
      }));
      for (const box of bodyBoxes) {
        assert.equal(box.borderLeftWidth, '0px', `narration body must not carry an annotation rule: ${JSON.stringify(box)}`);
        assert.equal(box.fontSize, '16px', `narration body must use normal body typography: ${JSON.stringify(box)}`);
      }
      assert.ok(new Set(bodyBoxes.map(box => box.color)).size === 1,
        `narration and answer must share normal body color: ${bodyBoxes.map(box => box.color)}`);

      // A process-chain summary occupies the gap between collapsed report
      // paragraphs: left rail + 思考×N · 工具×K + chevron, one per gap.
      const seams = turn5.locator('[data-reader-process-seam]');
      assert.equal(await seams.count(), 2, `expected two process seams, got ${await seams.count()}`);
      const seamBoxes = await seams.evaluateAll(elements => elements.map(element => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const button = element.querySelector('button');
        return {
          top: rect.top + window.scrollY, bottom: rect.bottom + window.scrollY, height: rect.height,
          borderLeftWidth: style.borderLeftWidth, borderLeftColor: style.borderLeftColor,
          summary: element.getAttribute('data-reader-process-seam-summary'),
          label: button?.getAttribute('aria-label'),
          foldSummary: element.querySelector('[data-reader-fold-summary]')?.getAttribute('data-reader-fold-summary'),
        };
      }));
      for (let index = 0; index < seamBoxes.length; index++) {
        const seam = seamBoxes[index];
        const before = bodyBoxes[index];
        const after = bodyBoxes[index + 1];
        assert.ok(seam.height >= 32, `process seam needs real vertical extent: ${JSON.stringify(seam)}`);
        assert.ok(seam.top >= before.bottom - 0.5, `seam must start after the previous body: ${JSON.stringify({ before, seam })}`);
        assert.ok(seam.bottom <= after.top + 0.5, `seam must end before the next body: ${JSON.stringify({ seam, after })}`);
        assert.ok(after.top - before.bottom >= 32, `seam must own the paragraph gap: ${JSON.stringify({ before, after })}`);
        assert.equal(seam.borderLeftWidth, '1px', `process seam rail width: ${JSON.stringify(seam)}`);
        assert.ok(seam.borderLeftColor !== 'rgba(0, 0, 0, 0)', `process seam rail is transparent: ${JSON.stringify(seam)}`);
        assert.match(seam.summary ?? '', /思考×|工具×|记录×/u, `seam summary must use process-chain counts: ${JSON.stringify(seam)}`);
        assert.equal(seam.label, '展开被折叠的过程', `seam must expose an expand control: ${JSON.stringify(seam)}`);
        assert.equal(seam.foldSummary, seam.summary, `seam must render the process-chain summary text: ${JSON.stringify(seam)}`);
      }
      result.snapshots.bodySeams = { bodyBoxes, seamBoxes };
      shots.push(await screenshot('green-body-process-seam', turn5));

      // The seam expands the real process rows in place instead of being decoration.
      await seams.first().getByRole('button', { name: '展开被折叠的过程', exact: true }).click();
      await expectVisible(turn5.getByText(texts.reasonF0, { exact: true }), '汇报前的思考 after expanding the seam');
      await expectVisible(turn5.getByText(texts.reasonG, { exact: true }), '补充说明前的思考 after expanding the seam');
      assert.equal(await turn5.locator('[data-reader-process-seam]').count(), 0, 'seams must disappear while the process is expanded');
      await turn5.getByRole('button', { name: /^收起(思考与过程|本轮过程详情)$/u }).first().click();
      assert.equal(await turn5.locator('[data-reader-process-seam]').count(), 2, 'seams must return when the process folds again');
      await expectHidden(turn5.getByText(texts.reasonF0, { exact: true }), '汇报前的思考 after folding again');
    });

    await check('e no page errors and no unrenderable fallback', async () => {
      assert.deepEqual(errors, []);
      assert.equal(await page.getByText('此内容暂时无法展示', { exact: false }).count(), 0);
    });
  }
} finally {
  result.errors = errors;
  result.finishedAt = new Date().toISOString();
  result.snapshots.final = page ? await domSnapshot().catch(() => null) : null;
  result.passed = failures.length === 0;
  result.shots = shots;
  await mkdir(join(outDir, mode), { recursive: true });
  await writeFile(join(outDir, mode, 'result.json'), JSON.stringify(result, null, 2));
  await browser.close();
  await new Promise(done => server.close(done));
}
console.log(JSON.stringify({ mode, passed: result.passed, git: result.git, checks: checks.map(item => ({ name: item.name, passed: item.passed, error: item.error })), shots }, null, 2));
process.exitCode = failures.length ? 1 : 0;
