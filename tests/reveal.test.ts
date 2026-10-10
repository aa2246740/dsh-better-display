import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { IncomingMessage, ServerResponse } from 'node:http';
import { Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { createRevealHandler, resolveRevealPath, revealPath, revealRoots } from '../src/reveal.js';
import { isAbsoluteWorkspacePath } from '../src/workspace-path.js';
import { dirname } from '../src/client/deliverables.js';

test('absolute parent predicate accepts POSIX, drive and UNC roots only', () => {
  for (const path of ['/', '/repo', 'C:\\', 'C:/', 'D:\\5- AI\\docs', '\\\\server\\share']) {
    assert.equal(isAbsoluteWorkspacePath(path), true, path);
  }
  for (const path of ['', '.', 'docs', './docs', '../docs', 'C:', 'C:docs', '\\docs']) {
    assert.equal(isAbsoluteWorkspacePath(path), false, path);
  }
  assert.equal(dirname('/a.txt'), '/');
  assert.equal(dirname('C:\\a.txt'), 'C:\\');
  assert.equal(dirname('C:/a.txt'), 'C:/');
  assert.equal(isAbsoluteWorkspacePath(dirname('docs/a.txt')), false);
});

async function workspace(t: { after: (cleanup: () => Promise<void>) => void }) {
  const root = await mkdtemp(join(tmpdir(), 'bd-reveal-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'docs'));
  await writeFile(join(root, 'docs', 'report.md'), 'report');
  return root;
}

test('relative resolution uses an existing full path, rejects missing and ambiguous matches', async t => {
  const root = await workspace(t);
  const other = await workspace(t);
  assert.equal(resolveRevealPath('docs/report.md', [root]), join(root, 'docs', 'report.md'));
  assert.equal(resolveRevealPath('docs/report.md', ['/missing-root', root, root]), join(root, 'docs', 'report.md'));
  assert.throws(() => resolveRevealPath('docs/missing.md', [root]), /not found/);
  assert.throws(() => resolveRevealPath('docs/report.md', []), /not found/);
  assert.throws(() => resolveRevealPath('docs/report.md', [root, other]), /ambiguous/);
  assert.equal(resolveRevealPath('/absolute/file', []), '/absolute/file');
});

test('relative resolution preserves Windows drive and UNC spelling', () => {
  const exists = (path: string) => ['D:\\5- AI\\docs\\report.md', '\\\\server\\share\\docs\\report.md'].includes(path);
  assert.equal(resolveRevealPath('docs/report.md', ['D:\\5- AI'], exists), 'D:\\5- AI\\docs\\report.md');
  assert.equal(resolveRevealPath('docs/report.md', ['\\\\server\\share'], exists), '\\\\server\\share\\docs\\report.md');
  assert.throws(() => resolveRevealPath('C:report.md', ['D:\\5- AI'], exists), /not workspace-relative/);
  assert.throws(() => resolveRevealPath('\\report.md', ['D:\\5- AI'], exists), /not workspace-relative/);
});

function context(services: Record<string, unknown>): Context {
  return { get: (name: string) => services[name] } as unknown as Context;
}

test('host roots use only the target live session or its registered workspace', async () => {
  const ctx = context({
    sessions: { get: (id: string) => id === 'target' ? { header: { cwd: '/target' } } : undefined },
    workspaceRegistry: { list: () => [
      { path: '/other', sessionIds: ['other'] },
      { path: '/cold', sessionIds: ['cold'] },
    ] },
  });
  assert.deepEqual(await revealRoots(ctx, 'target'), ['/target']);
  assert.deepEqual(await revealRoots(ctx, 'cold'), ['/cold']);
  assert.deepEqual(await revealRoots(ctx, 'unknown'), []);
  assert.deepEqual(await revealRoots(ctx, undefined), ['/other', '/cold']);
});

test('cold session roots are read without projections and the observation is disposed', async () => {
  let disposed = false;
  const ctx = context({ sessionQuery: {
    observeSession: async (id: string, options: unknown) => {
      assert.equal(id, 'cold');
      assert.deepEqual(options, { projectionMode: 'none' });
      return { header: { cwd: '/cold' }, [Symbol.dispose]: () => { disposed = true; } };
    },
  } });
  assert.deepEqual(await revealRoots(ctx, 'cold'), ['/cold']);
  assert.equal(disposed, true);
});

async function request(handler: ReturnType<typeof createRevealHandler>, body: string, method = 'POST') {
  const req = new IncomingMessage(new Socket());
  req.method = method;
  const res = new ServerResponse(req);
  const response = new Promise<{ status: number; body: string }>(resolve => {
    res.end = (chunk: string) => {
      resolve({ status: res.statusCode, body: chunk ?? '' });
      return res;
    };
  });
  handler(req, res);
  req.emit('data', body);
  req.emit('end');
  return response;
}

test('reveal route resolves a session-relative request and never opens a missing path', async t => {
  const root = await workspace(t);
  const opened: string[] = [];
  const handler = createRevealHandler({
    roots: async sessionId => { assert.equal(sessionId, 'target'); return [root]; },
    reveal: path => { opened.push(path); },
  });
  assert.deepEqual(await request(handler, JSON.stringify({ path: 'docs/report.md', sessionId: 'target' })), {
    status: 200, body: '{"ok":true}',
  });
  assert.equal((await request(handler, JSON.stringify({ path: 'docs/missing.md', sessionId: 'target' }))).status, 400);
  assert.deepEqual(opened, [join(root, 'docs', 'report.md')]);
  assert.equal((await request(handler, '{}')).status, 400);
  assert.equal((await request(handler, 'invalid')).status, 400);
  assert.equal((await request(handler, '', 'GET')).status, 405);
});

test('absolute requests bypass root lookup and Explorer receives a quoted verbatim selection', async () => {
  const path = 'D:\\5- AI\\docs\\report.md';
  const calls: unknown[] = [];
  const handler = createRevealHandler({
    roots: async () => { throw new Error('absolute requests do not need roots'); },
    reveal: target => revealPath(target, 'win32', (...args) => { calls.push(args); }),
  });
  assert.equal((await request(handler, JSON.stringify({ path }))).status, 200);
  assert.deepEqual(calls, [['explorer.exe', ['/select,"D:\\5- AI\\docs\\report.md"'], {
    detached: true, stdio: 'ignore', windowsVerbatimArguments: true,
  }]]);
});
