import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import semver from 'semver';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
  main: string;
  scripts?: { prepare?: string };
  exports: Record<string, { default?: string } | string>;
  files: string[];
  dsh: { bundle?: { patch?: string } };
  peerDependencies: Record<string, string>;
};

const HARNESS_PEER = '>=0.2.0-rc.1 <0.2.1';

test('Harness 0.2.0 peer range accepts the rc.1 and stable releases', () => {
  const peers = Object.entries(pkg.peerDependencies).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));
  assert.ok(peers.length >= 12);
  for (const [name, range] of peers) {
    assert.equal(range, HARNESS_PEER, name);
    assert.equal(semver.satisfies('0.2.0-rc.2', range), true, name);
    assert.equal(semver.satisfies('0.2.0', range), true, name);
    assert.equal(semver.satisfies('0.2.0-alpha.1', range), false, name);
    assert.equal(semver.satisfies('0.2.0-alpha', range), false, name);
    assert.equal(semver.satisfies('0.1.7-rc.2', range), false, name);
  }
});

test('declares dsh.bundle.patch so official add joins the profile layer stack', () => {
  assert.equal(pkg.dsh.bundle?.patch, './cordis.patch.yml');
  assert.equal(existsSync(resolve(root, 'cordis.patch.yml')), true);
  const patch = readFileSync(resolve(root, 'cordis.patch.yml'), 'utf8');
  assert.match(patch, /id: dsh-better-display/);
  assert.match(patch, /name: dsh-better-display/);
  assert.equal(pkg.files.includes('cordis.patch.yml'), true);
});

test('commits compiled lib entries and does not require a prepare script', () => {
  assert.equal(pkg.scripts?.prepare, undefined);
  assert.equal(pkg.main, 'lib/dsh-better-display.js');
  const client = pkg.exports['./client'];
  assert.equal(typeof client === 'object' && client !== null ? client.default : client, './lib/client.js');
  assert.equal(existsSync(resolve(root, 'lib/dsh-better-display.js')), true);
  assert.equal(existsSync(resolve(root, 'lib/client.js')), true);
  const clientJs = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  assert.match(clientJs, /window\.__ModuleLoader__\.load/);
  assert.match(clientJs, /id:\s*"dsh-better-display"/);
  assert.match(clientJs, /settings\.section/);
  assert.match(clientJs, /deliverableOpenMode/);
  assert.match(clientJs, /frostedGlass/);
  assert.match(clientJs, /foldIntensity/);
  assert.match(clientJs, /setFrostedGlass/);
  assert.match(clientJs, /setFoldIntensity/);
  assert.match(clientJs, /data-reader-glass/);
  assert.match(clientJs, /modeFromSnapshot/);
  assert.match(clientJs, /str_replace_editor/);
  assert.doesNotMatch(clientJs, /只折叠过程/);
  assert.match(clientJs, /\.dsh\/skills/);
  assert.doesNotMatch(clientJs, /submission\.images\.length/);
});

test('compiled host entry loads in Node without a TypeScript loader', () => {
  const result = spawnSync(process.execPath, ['--input-type=module', '--eval',
    "const plugin = await import('./lib/dsh-better-display.js'); if (plugin.name !== 'dsh-better-display' || typeof plugin.apply !== 'function') process.exit(1);",
  ], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || String(result.error ?? 'host entry did not load'));
});

test('README leads with the official stock one-liner and names pnpm', () => {
  for (const name of ['README.md', 'README.en.md']) {
    const text = readFileSync(resolve(root, name), 'utf8');
    assert.match(text, /dsh plugin --profile web add github:aa2246740\/dsh-better-display/);
    assert.match(text, /pnpm/);
    assert.doesNotMatch(text, /activate-new-client/);
    assert.doesNotMatch(text, /my-plugins/);
    assert.doesNotMatch(text, /DSHX_HARNESS/);
  }
});
