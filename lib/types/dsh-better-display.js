import { scanGenerativeMcpappsStatus } from './skill-roots.js';
import { skillsFromListResult, toPublicSkillStatus } from './skill-status.js';
import { createRevealHandler, revealRoots } from './reveal.js';
export const name = 'dsh-better-display';
export const inject = ['webServer'];
function writeJson(res, status, body) {
    res.setHeader('Content-Type', 'application/json');
    res.statusCode = status;
    res.end(JSON.stringify(body));
}
function skillLister(ctx) {
    const skills = ctx.get?.('skills');
    if (typeof skills?.list !== 'function')
        return undefined;
    return async () => skillsFromListResult(await skills.list({}));
}
export function apply(ctx) {
    console.log('[my-plugins/dsh-better-display] loaded');
    if (ctx.webServer) {
        ctx.effect(() => {
            const disposeReveal = ctx.webServer.register({
                kind: 'exact',
                path: '/better-display/reveal',
                handler: createRevealHandler({ roots: sessionId => revealRoots(ctx, sessionId) }),
            });
            const disposeSkill = ctx.webServer.register({
                kind: 'exact',
                path: '/better-display/skill-status',
                handler: async (req, res) => {
                    if (req.method !== 'GET') {
                        res.statusCode = 405;
                        res.end();
                        return;
                    }
                    try {
                        const url = new URL(req.url ?? '', 'http://127.0.0.1');
                        const cwd = url.searchParams.get('cwd') ?? undefined;
                        const status = await scanGenerativeMcpappsStatus({
                            cwd,
                            listSkills: skillLister(ctx),
                        });
                        writeJson(res, 200, toPublicSkillStatus(status));
                    }
                    catch (err) {
                        writeJson(res, 500, { ok: false, error: String(err) });
                    }
                },
            });
            return () => {
                disposeReveal();
                disposeSkill();
            };
        }, 'dsh-better-display: reveal and skill-status routes');
    }
}
//# sourceMappingURL=dsh-better-display.js.map