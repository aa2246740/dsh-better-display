import { spawn } from "node:child_process";
//#region src/dsh-better-display.ts
const name = "dsh-better-display";
const inject = ["webServer"];
function apply(ctx) {
	console.log("[my-plugins/dsh-better-display] loaded");
	if (ctx.webServer) ctx.effect(() => {
		return ctx.webServer.register({
			kind: "exact",
			path: "/better-display/reveal",
			handler: async (req, res) => {
				if (req.method !== "POST") {
					res.statusCode = 405;
					res.end();
					return;
				}
				let body = "";
				req.on("data", (chunk) => {
					body += chunk;
				});
				req.on("end", () => {
					try {
						const data = JSON.parse(body);
						const targetPath = typeof data.path === "string" ? data.path.trim() : "";
						if (!targetPath) {
							res.statusCode = 400;
							res.end(JSON.stringify({
								ok: false,
								error: "Empty path"
							}));
							return;
						}
						if (process.platform === "darwin") spawn("open", ["-R", targetPath], {
							detached: true,
							stdio: "ignore"
						});
						else if (process.platform === "win32") spawn("explorer.exe", [`/select,${targetPath}`], {
							detached: true,
							stdio: "ignore"
						});
						else spawn("xdg-open", [targetPath], {
							detached: true,
							stdio: "ignore"
						});
						res.setHeader("Content-Type", "application/json");
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
			}
		});
	}, "dsh-better-display: /api/better-display/reveal route");
}
//#endregion
export { apply, inject, name };
