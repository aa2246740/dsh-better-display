import { spawn, type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { posix, win32 } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { isAbsoluteWorkspacePath } from './workspace-path.js';

export async function revealRoots(ctx: Context, sessionId: string | undefined): Promise<readonly string[]> {
  if (sessionId !== undefined) {
    const sessions = ctx.get?.('sessions') as { get: (id: string) => { header: { cwd?: string } } | undefined } | undefined;
    const cwd = sessions?.get(sessionId)?.header.cwd;
    if (cwd) return [cwd];
    const query = ctx.get?.('sessionQuery') as {
      observeSession: (id: string, options: { projectionMode: 'none' }) => Promise<{ header: { cwd?: string } } & Disposable>;
    } | undefined;
    if (query) {
      using observation = await query.observeSession(sessionId, { projectionMode: 'none' });
      if (observation.header.cwd) return [observation.header.cwd];
    }
  }
  const registry = ctx.get?.('workspaceRegistry') as {
    list: () => readonly { path: string; sessionIds: readonly string[] }[];
  } | undefined;
  return (registry?.list() ?? [])
    .filter(workspace => sessionId === undefined || workspace.sessionIds.includes(sessionId))
    .map(workspace => workspace.path);
}

export function resolveRevealPath(path: string, roots: readonly string[], exists = existsSync): string {
  if (isAbsoluteWorkspacePath(path)) return path;
  // Drive-relative and root-relative Windows paths do not identify a workspace.
  if (/^[A-Za-z]:|^\\/.test(path)) throw new Error('Path is not workspace-relative');
  const matches = new Set<string>();
  for (const root of roots) {
    if (!isAbsoluteWorkspacePath(root)) continue;
    const paths = /^[A-Za-z]:[/\\]|^\\\\/.test(root) ? win32 : posix;
    const candidate = paths.resolve(root, path);
    if (exists(candidate)) matches.add(candidate);
  }
  if (matches.size !== 1) throw new Error(matches.size === 0 ? 'Workspace path not found' : 'Workspace path is ambiguous');
  return [...matches][0];
}

export function revealPath(
  path: string,
  platform = process.platform,
  spawnProcess: (command: string, args: string[], options: SpawnOptions) => unknown = spawn,
): void {
  const options = { detached: true, stdio: 'ignore' } satisfies SpawnOptions;
  if (platform === 'darwin') {
    spawnProcess('open', ['-R', path], options);
  } else if (platform === 'win32') {
    spawnProcess('explorer.exe', [`/select,"${path}"`], { ...options, windowsVerbatimArguments: true });
  } else {
    spawnProcess('xdg-open', [path], options);
  }
}

export function createRevealHandler({ roots, reveal = revealPath }: {
  roots: (sessionId: string | undefined) => Promise<readonly string[]>;
  reveal?: (path: string) => void;
}): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (req.method !== 'POST') {
      res.statusCode = 405;
      res.end();
      return;
    }
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      res.setHeader('Content-Type', 'application/json');
      try {
        const data: unknown = JSON.parse(body);
        const path = typeof data === 'object' && data !== null && 'path' in data && typeof data.path === 'string'
          ? data.path.trim() : '';
        if (!path) throw new Error('Empty path');
        const sessionId = typeof data === 'object' && data !== null && 'sessionId' in data && typeof data.sessionId === 'string'
          ? data.sessionId : undefined;
        const targetPath = resolveRevealPath(path, isAbsoluteWorkspacePath(path) ? [] : await roots(sessionId));
        reveal(targetPath);
        res.statusCode = 200;
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.statusCode = 400;
        res.end(JSON.stringify({ ok: false, error: String(err) }));
      }
    });
  };
}
