import { access, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
//#region src/skill-status.ts
/** Shared generative-mcpapps identity. Plugin-tree presence is not installation. */
const GENERATIVE_MCPAPPS_SKILL = "generative-mcpapps";
/** Conventional relative roots only. Never expand $HOME or dump host `root.path`. */
const CONVENTIONAL_SKILL_ROOTS = [".dsh/skills", ".agents/skills"];
function skillNameMatches(name) {
	return typeof name === "string" && name === "generative-mcpapps";
}
function skillListIncludes(entries) {
	return Array.isArray(entries) && entries.some((entry) => skillNameMatches(entry?.name));
}
/** Directory bundle `name/SKILL.md` or flat `name.md` at a scanned root. */
function skillRootEntryMatches(entryName) {
	return entryName === "generative-mcpapps" || entryName === `generative-mcpapps.md`;
}
function skillsFromListResult(result) {
	if (Array.isArray(result)) return result;
	if (result === null || typeof result !== "object") return [];
	const record = result;
	if (record.ok === false) return [];
	if (Array.isArray(record.skills)) return record.skills;
	if (record.value && typeof record.value === "object") {
		const value = record.value;
		if (Array.isArray(value.skills)) return value.skills;
		if (Array.isArray(record.value)) return record.value;
	}
	return [];
}
function publicSkillRoots() {
	return CONVENTIONAL_SKILL_ROOTS.map((path) => ({
		source: "conventional",
		path
	}));
}
/**
* Strip host home / pack absolutes before anything user-facing (HTTP or Settings).
* Detection still uses the raw scan; this is the public face.
*/
function toPublicSkillStatus(status) {
	return {
		name: status.name,
		installed: status.installed,
		via: status.via,
		roots: publicSkillRoots()
	};
}
//#endregion
//#region src/skill-roots.ts
function expandHomePath(path, home = homedir()) {
	if (path === "~") return home;
	if (path.startsWith("~/") || path.startsWith("~\\")) return join(home, path.slice(2));
	return path;
}
/** `$DSH_HOME` or `~/.dsh`, matching official `resolveDshHome`. */
function resolveDshHome(env = process.env, home = homedir()) {
	const fromEnv = env.DSH_HOME;
	const selected = fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : join(home, ".dsh");
	return resolve(expandHomePath(selected, home));
}
/** `$DSH_AGENTS_HOME` or `~/.agents`. */
function resolveAgentsHome(env = process.env, home = homedir()) {
	const fromEnv = env.DSH_AGENTS_HOME;
	const selected = fromEnv !== void 0 && fromEnv.trim().length > 0 ? fromEnv : join(home, ".agents");
	return resolve(expandHomePath(selected, home));
}
function userSkillRoots(env = process.env, home = homedir()) {
	return [{
		source: "user-dsh",
		path: join(resolveDshHome(env, home), "skills")
	}, {
		source: "user-agents",
		path: join(resolveAgentsHome(env, home), "skills")
	}];
}
function projectSkillRoots(projectRoot) {
	return [{
		source: "project-dsh",
		path: join(projectRoot, ".dsh", "skills")
	}, {
		source: "project-agents",
		path: join(projectRoot, ".agents", "skills")
	}];
}
async function findProjectRoot(cwd) {
	let current = resolve(cwd);
	while (true) {
		if (existsSync(join(current, ".git"))) return current;
		const parent = dirname(current);
		if (parent === current) return resolve(cwd);
		current = parent;
	}
}
async function rootHasGenerativeMcpapps(rootPath) {
	let entries;
	try {
		entries = await readdir(rootPath, { withFileTypes: true });
	} catch {
		return false;
	}
	for (const entry of entries) {
		if (entry.name === ".system") continue;
		if (!skillRootEntryMatches(entry.name)) continue;
		if (entry.isDirectory()) try {
			await access(join(rootPath, entry.name, "SKILL.md"));
			return true;
		} catch {
			continue;
		}
		if (entry.isFile()) return true;
	}
	return false;
}
/** Resolve the plugin-shipped pack. This path is never treated as a skill root. */
function pluginSkillPackPath(moduleUrl = import.meta.url) {
	const here = dirname(fileURLToPath(moduleUrl));
	return [
		join(here, "../skills", GENERATIVE_MCPAPPS_SKILL),
		join(here, "../../skills", GENERATIVE_MCPAPPS_SKILL),
		join(here, "skills", GENERATIVE_MCPAPPS_SKILL)
	].find((path) => existsSync(join(path, "SKILL.md")));
}
async function scanGenerativeMcpappsStatus(options = {}) {
	const roots = [...userSkillRoots(options.env ?? process.env, options.home ?? homedir())];
	const cwd = typeof options.cwd === "string" && options.cwd.trim().length > 0 ? isAbsolute(options.cwd) ? options.cwd : resolve(options.cwd) : void 0;
	if (cwd !== void 0) roots.unshift(...projectSkillRoots(await findProjectRoot(cwd)));
	const inspected = [];
	let rootHit = false;
	for (const root of roots) {
		const present = await rootHasGenerativeMcpapps(root.path);
		inspected.push({
			...root,
			present
		});
		if (present) rootHit = true;
	}
	let via = null;
	let listHit = false;
	if (options.listSkills) try {
		listHit = skillListIncludes(await options.listSkills());
		if (listHit) via = "skills.list";
	} catch {}
	if (!listHit && rootHit) via = "skill-root";
	const packPath = options.packPath ?? pluginSkillPackPath();
	return {
		name: GENERATIVE_MCPAPPS_SKILL,
		installed: listHit || rootHit,
		via,
		roots: inspected,
		...packPath !== void 0 ? { packPath } : {}
	};
}
//#endregion
//#region src/workspace-path.ts
/** Absolute paths accepted by both POSIX and Windows hosts. */
function isAbsoluteWorkspacePath(path) {
	return /^(?:\/|[A-Za-z]:[/\\]|\\\\)/.test(path);
}
//#endregion
//#region \0@oxc-project+runtime@0.153.0/helpers/esm/usingCtx.js
function _usingCtx() {
	var r = "function" == typeof SuppressedError ? SuppressedError : function(r, e) {
		var n = Error();
		return n.name = "SuppressedError", n.error = r, n.suppressed = e, n;
	}, e = {}, n = [];
	function using(r, e) {
		if (null != e) {
			if (Object(e) !== e) throw new TypeError("using declarations can only be used with objects, functions, null, or undefined.");
			if (r) var o = e[Symbol.asyncDispose || Symbol["for"]("Symbol.asyncDispose")];
			if (void 0 === o && (o = e[Symbol.dispose || Symbol["for"]("Symbol.dispose")], r)) var t = o;
			if ("function" != typeof o) throw new TypeError("Object is not disposable.");
			t && (o = function o() {
				try {
					t.call(e);
				} catch (r) {
					return Promise.reject(r);
				}
			}), n.push({
				v: e,
				d: o,
				a: r
			});
		} else r && n.push({
			d: e,
			a: r
		});
		return e;
	}
	return {
		e,
		u: using.bind(null, !1),
		a: using.bind(null, !0),
		d: function d() {
			var o, t = this.e, s = 0;
			function next() {
				for (; o = n.pop();) try {
					if (!o.a && 1 === s) return s = 0, n.push(o), Promise.resolve().then(next);
					if (o.d) {
						var r = o.d.call(o.v);
						if (o.a) return s |= 2, Promise.resolve(r).then(next, err);
					} else s |= 1;
				} catch (r) {
					return err(r);
				}
				if (1 === s) return t !== e ? Promise.reject(t) : Promise.resolve();
				if (t !== e) throw t;
			}
			function err(n) {
				return t = t !== e ? new r(n, t) : n, next();
			}
			return next();
		}
	};
}
//#endregion
//#region src/reveal.ts
async function revealRoots(ctx, sessionId) {
	if (sessionId !== void 0) {
		const cwd = (ctx.get?.("sessions"))?.get(sessionId)?.header.cwd;
		if (cwd) return [cwd];
		const query = ctx.get?.("sessionQuery");
		if (query) try {
			var _usingCtx$1 = _usingCtx();
			const observation = _usingCtx$1.u(await query.observeSession(sessionId, { projectionMode: "none" }));
			if (observation.header.cwd) return [observation.header.cwd];
		} catch (_) {
			_usingCtx$1.e = _;
		} finally {
			_usingCtx$1.d();
		}
	}
	return ((ctx.get?.("workspaceRegistry"))?.list() ?? []).filter((workspace) => sessionId === void 0 || workspace.sessionIds.includes(sessionId)).map((workspace) => workspace.path);
}
function resolveRevealPath(path, roots, exists = existsSync) {
	if (isAbsoluteWorkspacePath(path)) return path;
	if (/^[A-Za-z]:|^\\/.test(path)) throw new Error("Path is not workspace-relative");
	const matches = /* @__PURE__ */ new Set();
	for (const root of roots) {
		if (!isAbsoluteWorkspacePath(root)) continue;
		const candidate = (/^[A-Za-z]:[/\\]|^\\\\/.test(root) ? win32 : posix).resolve(root, path);
		if (exists(candidate)) matches.add(candidate);
	}
	if (matches.size !== 1) throw new Error(matches.size === 0 ? "Workspace path not found" : "Workspace path is ambiguous");
	return [...matches][0];
}
function revealPath(path, platform = process.platform, spawnProcess = spawn) {
	const options = {
		detached: true,
		stdio: "ignore"
	};
	if (platform === "darwin") spawnProcess("open", ["-R", path], options);
	else if (platform === "win32") spawnProcess("explorer.exe", [`/select,"${path}"`], {
		...options,
		windowsVerbatimArguments: true
	});
	else spawnProcess("xdg-open", [path], options);
}
function createRevealHandler({ roots, reveal = revealPath }) {
	return (req, res) => {
		if (req.method !== "POST") {
			res.statusCode = 405;
			res.end();
			return;
		}
		let body = "";
		req.on("data", (chunk) => {
			body += chunk;
		});
		req.on("end", async () => {
			res.setHeader("Content-Type", "application/json");
			try {
				const data = JSON.parse(body);
				const path = typeof data === "object" && data !== null && "path" in data && typeof data.path === "string" ? data.path.trim() : "";
				if (!path) throw new Error("Empty path");
				const sessionId = typeof data === "object" && data !== null && "sessionId" in data && typeof data.sessionId === "string" ? data.sessionId : void 0;
				reveal(resolveRevealPath(path, isAbsoluteWorkspacePath(path) ? [] : await roots(sessionId)));
				res.statusCode = 200;
				res.end(JSON.stringify({ ok: true }));
			} catch (err) {
				res.statusCode = 400;
				res.end(JSON.stringify({
					ok: false,
					error: String(err)
				}));
			}
		});
	};
}
//#endregion
//#region src/dsh-better-display.ts
const name = "dsh-better-display";
const inject = ["webServer"];
function writeJson(res, status, body) {
	res.setHeader("Content-Type", "application/json");
	res.statusCode = status;
	res.end(JSON.stringify(body));
}
function skillLister(ctx) {
	const skills = ctx.get?.("skills");
	if (typeof skills?.list !== "function") return void 0;
	return async () => skillsFromListResult(await skills.list({}));
}
function apply(ctx) {
	console.log("[my-plugins/dsh-better-display] loaded");
	if (ctx.webServer) ctx.effect(() => {
		const disposeReveal = ctx.webServer.register({
			kind: "exact",
			path: "/better-display/reveal",
			handler: createRevealHandler({ roots: (sessionId) => revealRoots(ctx, sessionId) })
		});
		const disposeSkill = ctx.webServer.register({
			kind: "exact",
			path: "/better-display/skill-status",
			handler: async (req, res) => {
				if (req.method !== "GET") {
					res.statusCode = 405;
					res.end();
					return;
				}
				try {
					writeJson(res, 200, toPublicSkillStatus(await scanGenerativeMcpappsStatus({
						cwd: new URL(req.url ?? "", "http://127.0.0.1").searchParams.get("cwd") ?? void 0,
						listSkills: skillLister(ctx)
					})));
				} catch (err) {
					writeJson(res, 500, {
						ok: false,
						error: String(err)
					});
				}
			}
		});
		return () => {
			disposeReveal();
			disposeSkill();
		};
	}, "dsh-better-display: reveal and skill-status routes");
}
//#endregion
export { apply, inject, name };
