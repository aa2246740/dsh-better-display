import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, posix, resolve, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { access, readdir } from "node:fs/promises";
import { homedir } from "node:os";
// src/flags.ts
const defaultFlags = { readerEnabled: true };
function locateFlags(start = dirname(fileURLToPath(import.meta.url))) {
	let dir = start;
	for (let depth = 0; depth < 6; depth += 1) {
		const candidate = resolve(dir, "flags.json");
		if (existsSync(candidate)) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return void 0;
		dir = parent;
	}
}
function normalize(value) {
	const record = value !== null && typeof value === "object" ? value : {};
	return { readerEnabled: typeof record.readerEnabled === "boolean" ? record.readerEnabled : defaultFlags.readerEnabled };
}
function loadFlags(source) {
	if (source !== void 0 && typeof source !== "string") return normalize(source);
	try {
		const path = typeof source === "string" ? source : locateFlags();
		if (path === void 0 || !existsSync(path)) return { ...defaultFlags };
		return normalize(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return { ...defaultFlags };
	}
}
// src/log.ts
const REDACTED = "[REDACTED]";
const REQUEST_ID_HEADER = "x-request-id";
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,200}$/;
const SECRET_KEYS = /* @__PURE__ */ new Set([
	"authorization",
	"proxyauthorization",
	"cookie",
	"setcookie",
	"token",
	"accesstoken",
	"refreshtoken",
	"idtoken",
	"apikey",
	"apisecret",
	"secret",
	"clientsecret",
	"password",
	"passwd",
	"credential",
	"credentials",
	"signature",
	"sig",
	"jwt",
	"bearer",
	"privatekey",
	"xapikey",
	"xauthtoken",
	"xaccesstoken",
	"auth"
]);
function normalizeKey(key) {
	return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function isSecretKey(key) {
	const normalized = normalizeKey(key);
	if (SECRET_KEYS.has(normalized)) return true;
	if (normalized === "requestid" || normalized === "xrequestid") return false;
	return /(?:^|[^a-z])(?:token|secret|password|api[-_]?key)$/i.test(key);
}
function redactString(value) {
	return value.replace(/([?&#])([^&#=]+)=([^&#]*)/g, (match, sep, rawKey) => {
		let key;
		try {
			key = decodeURIComponent(rawKey.replace(/\+/g, " "));
		} catch {
			key = rawKey;
		}
		return isSecretKey(key) ? `${sep}${rawKey}=${REDACTED}` : match;
	}).replace(/\b(Bearer|Basic)\s+\S+/gi, `$1 ${REDACTED}`).replace(/\b((?:access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|client[_-]?secret|password|passwd|authorization|token|secret))(\s*[:=]\s*)([^\s&]+)/gi, `$1$2${REDACTED}`);
}
function redact(value) {
	return redactValue(void 0, value, 0, /* @__PURE__ */ new WeakSet());
}
function redactValue(key, value, depth, seen) {
	if (key !== void 0 && isSecretKey(key)) return REDACTED;
	if (depth > 8) return REDACTED;
	if (typeof value === "string") return redactString(value);
	if (typeof value === "number" || typeof value === "boolean" || value === null || value === void 0) return value;
	if (typeof value !== "object") return REDACTED;
	if (value instanceof Date) return value.toISOString();
	if (value instanceof Error) return redactValue(void 0, {
		name: value.name,
		message: value.message
	}, depth + 1, seen);
	if (seen.has(value)) return REDACTED;
	seen.add(value);
	if (Array.isArray(value)) return value.map((item) => redactValue(void 0, item, depth + 1, seen));
	const output = {};
	for (const [childKey, childValue] of Object.entries(value)) output[childKey] = redactValue(childKey, childValue, depth + 1, seen);
	return output;
}
function createLogger(options = {}) {
	const write = options.write ?? ((line) => {
		console.log(line);
	});
	const clock = options.clock ?? (() => /* @__PURE__ */ new Date());
	const emit = (level, msg, fields) => {
		const details = redact({
			...options.base,
			...fields
		});
		const record = {
			...details !== null && typeof details === "object" ? details : {},
			time: clock().toISOString(),
			level,
			msg: redactString(msg)
		};
		try {
			write(JSON.stringify(record));
		} catch {
			write(JSON.stringify({
				time: record.time,
				level,
				msg: record.msg,
				error: "log record was not serializable"
			}));
		}
	};
	return {
		info: (msg, fields) => emit("info", msg, fields),
		warn: (msg, fields) => emit("warn", msg, fields),
		error: (msg, fields) => emit("error", msg, fields)
	};
}
function requestIdOf(req) {
	const raw = req.headers[REQUEST_ID_HEADER];
	const value = Array.isArray(raw) ? raw[0] : raw;
	if (typeof value === "string" && REQUEST_ID_PATTERN.test(value)) return value;
	return randomUUID();
}
// src/metrics.ts
const ROUTE_REVEAL = "/better-display/reveal";
const ROUTE_SKILL_STATUS = "/better-display/skill-status";
const ROUTE_METRICS = "/better-display/metrics";
const ROUTE_HITS = [
	ROUTE_REVEAL,
	ROUTE_SKILL_STATUS,
	ROUTE_METRICS
];
const hits = new Map(ROUTE_HITS.map((route) => [route, 0]));
const timings = new Map(ROUTE_HITS.map((route) => [route, {
	count: 0,
	totalMs: 0,
	maxMs: 0
}]));
function snapshotHits() {
	return Object.fromEntries(hits);
}
function snapshotTimings() {
	return Object.fromEntries([...timings].map(([route, timing]) => [route, { ...timing }]));
}
function recordRouteHit(route) {
	const next = (hits.get(route) ?? 0) + 1;
	hits.set(route, next);
	return next;
}
function recordRouteDuration(route, elapsedMs) {
	const ms = Number.isFinite(elapsedMs) && elapsedMs > 0 ? Math.round(elapsedMs) : 0;
	const current = timings.get(route) ?? {
		count: 0,
		totalMs: 0,
		maxMs: 0
	};
	const next = {
		count: current.count + 1,
		totalMs: current.totalMs + ms,
		maxMs: Math.max(current.maxMs, ms)
	};
	timings.set(route, next);
	return next;
}
function metricsPayload() {
	return {
		counters: { dsh_better_display_route_hits_total: snapshotHits() },
		timingsMs: snapshotTimings()
	};
}
// src/workspace-path.ts
/** Absolute paths accepted by both POSIX and Windows hosts. */
function isAbsoluteWorkspacePath(path) {
	return /^(?:\/|[A-Za-z]:[/\\]|\\\\)/.test(path);
}
// \0@oxc-project+runtime@0.156.0/helpers/esm/usingCtx.js
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
// src/reveal.ts
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
// src/skill-status.ts
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
// src/skill-roots.ts
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
// src/dsh-better-display.ts
const name = "dsh-better-display";
const inject = ["webServer"];
const log = createLogger({ base: { plugin: name } });
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
function beginRequest(req, res, route) {
	const requestId = requestIdOf(req);
	res.setHeader("X-Request-ID", requestId);
	recordRouteHit(route);
	const started = performance.now();
	res.on("finish", () => {
		recordRouteDuration(route, performance.now() - started);
	});
	log.info("http request", {
		requestId,
		route,
		method: req.method ?? "",
		url: req.url ?? "",
		headers: req.headers
	});
	return requestId;
}
function apply(ctx, options) {
	const flags = options?.flags ?? loadFlags();
	log.info("[my-plugins/dsh-better-display] loaded", { readerEnabled: flags.readerEnabled });
	if (!flags.readerEnabled) {
		log.info("route registration skipped", { readerEnabled: false });
		return;
	}
	if (ctx.webServer) ctx.effect(() => {
		const reveal = createRevealHandler({ roots: (sessionId) => revealRoots(ctx, sessionId) });
		const disposeReveal = ctx.webServer.register({
			kind: "exact",
			path: ROUTE_REVEAL,
			handler: (req, res) => {
				beginRequest(req, res, ROUTE_REVEAL);
				reveal(req, res);
			}
		});
		const disposeSkill = ctx.webServer.register({
			kind: "exact",
			path: ROUTE_SKILL_STATUS,
			handler: async (req, res) => {
				const requestId = beginRequest(req, res, ROUTE_SKILL_STATUS);
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
					log.error("skill-status failed", {
						requestId,
						error: err instanceof Error ? err.message : String(err)
					});
					writeJson(res, 500, {
						ok: false,
						error: String(err)
					});
				}
			}
		});
		const disposeMetrics = ctx.webServer.register({
			kind: "exact",
			path: ROUTE_METRICS,
			handler: (req, res) => {
				beginRequest(req, res, ROUTE_METRICS);
				if (req.method !== "GET") {
					res.statusCode = 405;
					res.end();
					return;
				}
				writeJson(res, 200, metricsPayload());
			}
		});
		return () => {
			disposeReveal();
			disposeSkill();
			disposeMetrics();
		};
	}, "dsh-better-display: reveal, skill-status, and metrics routes");
}
export { apply, inject, name };
