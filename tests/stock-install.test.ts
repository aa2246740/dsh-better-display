import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { test } from 'vitest';
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
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  engines?: { dsh?: string };
};

// Two Harness lines are supported: 0.2.1 (rc.1 onward, including stable 0.2.1) and
// 0.2.2 from rc.5 (including stable 0.2.2). The `-0` bounds keep 0.2.2-rc.1..rc.4
// and every 0.2.3 prerelease out. The Host's installer evaluates `engines.dsh`
// with `includePrerelease: true` (packages/boot/app-boot/src/plugin-compatibility.ts),
// so the assertions run under both npm's and the Host's semver semantics.
const HARNESS_PEER = '>=0.2.1-rc.1 <0.2.2-0 || >=0.2.2-rc.5 <0.2.3-0';

const ACCEPTED = ['0.2.1-rc.1', '0.2.1-rc.5', '0.2.1', '0.2.2-rc.5', '0.2.2-rc.6', '0.2.2'];
const REJECTED = ['0.2.1-alpha.1', '0.2.0-rc.2', '0.2.0', '0.1.7-rc.2', '0.2.2-alpha.3', '0.2.2-rc.1', '0.2.2-rc.4', '0.2.3-rc.1', '0.2.3'];

test('Harness peer range accepts the 0.2.1 line and 0.2.2 from rc.5, under npm and Host semver', () => {
  const peers = Object.entries(pkg.peerDependencies).filter(([name]) => name.startsWith('@deepseek-ai/dsh-'));
  assert.ok(peers.length >= 12);
  const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { engines?: { dsh?: string } };
  const ranges: [string, string | undefined][] = [...peers, ['engines.dsh', manifest.engines?.dsh]];
  for (const [name, range] of ranges) {
    assert.equal(range, HARNESS_PEER, name);
    for (const includePrerelease of [false, true]) {
      for (const version of ACCEPTED) assert.equal(semver.satisfies(version, range!, { includePrerelease }), true, `${name} ${version}`);
      for (const version of REJECTED) assert.equal(semver.satisfies(version, range!, { includePrerelease }), false, `${name} ${version}`);
    }
  }
});

test('cordis peer accepts the cordis line of both Harness lines', () => {
  const range = pkg.peerDependencies['@deepseek-ai/cordis']!;
  // 0.2.1-rc.5 packages peer on ~4.0.5; 0.2.2-rc.5 packages peer on ~4.1.0.
  for (const version of ['4.0.4', '4.0.5', '4.1.0', '4.1.3']) assert.equal(semver.satisfies(version, range), true, version);
  for (const version of ['4.2.0', '5.0.0', '4.0.3']) assert.equal(semver.satisfies(version, range), false, version);
});

// #93. An installer that resolves each peer from the profile's installation
// closure treats a peer as required unless peerDependenciesMeta marks it optional
// (or it is also a regular dependency). On a Desktop whose host packages live in
// app.asar, none of them resolve from that closure, so every unmarked peer failed
// the install. The bundles never load a peer through Node (see the next test),
// so every peer is optional. The version gate is unchanged: `engines.dsh` is what
// the Harness installer checks, and npm and pnpm still check an optional peer's
// range whenever the peer is present.
test('every peer is optional and keeps its range, so a host-less closure installs and the gate stays', () => {
  const peers = Object.keys(pkg.peerDependencies);
  assert.ok(peers.length >= 14);
  const meta = pkg.peerDependenciesMeta ?? {};
  assert.deepEqual(Object.keys(meta).sort(), [...peers].sort(), 'peerDependenciesMeta names exactly the peers');
  for (const name of peers) {
    assert.deepEqual(meta[name], { optional: true }, name);
    assert.equal(Object.hasOwn(pkg.dependencies ?? {}, name), false, `${name} is not also a regular dependency`);
    // The installer's own rule, as quoted in #93.
    const requiredPeer = Object.hasOwn(pkg.peerDependencies, name) && meta[name]?.optional !== true;
    assert.equal(requiredPeer, false, name);
    assert.ok(semver.validRange(pkg.peerDependencies[name]!), `${name} keeps a real range`);
  }
  assert.equal(pkg.engines?.dsh, HARNESS_PEER);
  assert.equal(semver.satisfies('0.2.2-rc.1', pkg.engines!.dsh!, { includePrerelease: true }), false);
});

test('optional peers are still installed for development at a version their range accepts', () => {
  // npm stops auto-installing a peer once it is optional, and the build inlines
  // dsh-session and dsh-util-workspace-path, so each peer is also a dev dependency.
  for (const [name, range] of Object.entries(pkg.peerDependencies)) {
    const dev = pkg.devDependencies?.[name];
    assert.ok(dev, `${name} is a dev dependency`);
    const pinned = semver.minVersion(dev);
    assert.ok(pinned && semver.satisfies(pinned, range, { includePrerelease: true }), `${name} dev ${dev} is inside ${range}`);
  }
});

test('the built bundles load no peer through Node', () => {
  // client.js is evaluated by the web client module loader. Its require() calls
  // are served from the platform module table, never from node_modules.
  const build = readFileSync(resolve(root, 'tools/client-build.js'), 'utf8');
  const table = /const PLATFORM_MODULES = \[([\s\S]*?)\]/.exec(build)?.[1] ?? '';
  const platform = new Set([...table.matchAll(/'([^']+)'/g)].map(match => match[1]));
  assert.ok(platform.has('react') && platform.has('@deepseek-ai/dsh-client-store'));
  const client = readFileSync(resolve(root, 'lib/client.js'), 'utf8');
  const required = new Set([...client.matchAll(/\brequire\("([^"]+)"\)/g)].map(match => match[1]));
  assert.ok(required.size > 0);
  for (const name of required) assert.ok(platform.has(name), `lib/client.js requires ${name}, which the platform table does not serve`);
  // The host entry runs in Node and imports only Node built-ins.
  const host = readFileSync(resolve(root, 'lib/dsh-better-display.js'), 'utf8');
  const imported = [...host.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?\bfrom\s*"([^"]+)"|\bimport\(\s*"([^"]+)"\s*\)/g)].map(match => match[1] ?? match[2]);
  assert.ok(imported.length > 0);
  for (const name of imported) assert.match(name!, /^node:/, `lib/dsh-better-display.js imports ${name}`);
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
