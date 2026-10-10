import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
import { scanGenerativeMcpappsStatus } from './skill-roots.js';
import { skillsFromListResult, toPublicSkillStatus } from './skill-status.js';
import { createRevealHandler, revealRoots } from './reveal.js';

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer?: {
      register: (route: {
        kind: 'exact' | 'prefix';
        path: string;
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>;
      }) => () => void;
    };
  }
}

export const name = 'dsh-better-display';
export const inject = ['webServer'];

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

function skillLister(ctx: Context): (() => Promise<readonly { readonly name?: string }[] | undefined>) | undefined {
  const skills = ctx.get?.('skills') as { list?: (options?: object) => Promise<unknown> } | undefined;
  if (typeof skills?.list !== 'function') return undefined;
  return async () => skillsFromListResult(await skills.list!({}));
}

export function apply(ctx: Context): void {
  console.log('[my-plugins/dsh-better-display] loaded');

  if (ctx.webServer) {
    ctx.effect(() => {
      const disposeReveal = ctx.webServer!.register({
        kind: 'exact',
        path: '/better-display/reveal',
        handler: createRevealHandler({ roots: sessionId => revealRoots(ctx, sessionId) }),
      });
      const disposeSkill = ctx.webServer!.register({
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
          } catch (err) {
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
