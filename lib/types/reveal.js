var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { posix, win32 } from 'node:path';
import { isAbsoluteWorkspacePath } from './workspace-path.js';
export async function revealRoots(ctx, sessionId) {
    if (sessionId !== undefined) {
        const sessions = ctx.get?.('sessions');
        const cwd = sessions?.get(sessionId)?.header.cwd;
        if (cwd)
            return [cwd];
        const query = ctx.get?.('sessionQuery');
        if (query) {
            const env_1 = { stack: [], error: void 0, hasError: false };
            try {
                const observation = __addDisposableResource(env_1, await query.observeSession(sessionId, { projectionMode: 'none' }), false);
                if (observation.header.cwd)
                    return [observation.header.cwd];
            }
            catch (e_1) {
                env_1.error = e_1;
                env_1.hasError = true;
            }
            finally {
                __disposeResources(env_1);
            }
        }
    }
    const registry = ctx.get?.('workspaceRegistry');
    return (registry?.list() ?? [])
        .filter(workspace => sessionId === undefined || workspace.sessionIds.includes(sessionId))
        .map(workspace => workspace.path);
}
export function resolveRevealPath(path, roots, exists = existsSync) {
    if (isAbsoluteWorkspacePath(path))
        return path;
    // Drive-relative and root-relative Windows paths do not identify a workspace.
    if (/^[A-Za-z]:|^\\/.test(path))
        throw new Error('Path is not workspace-relative');
    const matches = new Set();
    for (const root of roots) {
        if (!isAbsoluteWorkspacePath(root))
            continue;
        const paths = /^[A-Za-z]:[/\\]|^\\\\/.test(root) ? win32 : posix;
        const candidate = paths.resolve(root, path);
        if (exists(candidate))
            matches.add(candidate);
    }
    if (matches.size !== 1)
        throw new Error(matches.size === 0 ? 'Workspace path not found' : 'Workspace path is ambiguous');
    return [...matches][0];
}
export function revealPath(path, platform = process.platform, spawnProcess = spawn) {
    const options = { detached: true, stdio: 'ignore' };
    if (platform === 'darwin') {
        spawnProcess('open', ['-R', path], options);
    }
    else if (platform === 'win32') {
        spawnProcess('explorer.exe', [`/select,"${path}"`], { ...options, windowsVerbatimArguments: true });
    }
    else {
        spawnProcess('xdg-open', [path], options);
    }
}
export function createRevealHandler({ roots, reveal = revealPath }) {
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
                const data = JSON.parse(body);
                const path = typeof data === 'object' && data !== null && 'path' in data && typeof data.path === 'string'
                    ? data.path.trim() : '';
                if (!path)
                    throw new Error('Empty path');
                const sessionId = typeof data === 'object' && data !== null && 'sessionId' in data && typeof data.sessionId === 'string'
                    ? data.sessionId : undefined;
                const targetPath = resolveRevealPath(path, isAbsoluteWorkspacePath(path) ? [] : await roots(sessionId));
                reveal(targetPath);
                res.statusCode = 200;
                res.end(JSON.stringify({ ok: true }));
            }
            catch (err) {
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: String(err) }));
            }
        });
    };
}
//# sourceMappingURL=reveal.js.map