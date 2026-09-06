import type { Context } from '@deepseek-ai/cordis';

export const name = 'dsh-deckseek';
export const inject: string[] = [];

// Presentation only: no provider, tool, session-log or permission mutations.
export function apply(_ctx: Context): void {
  console.log('[my-plugins/dsh-deckseek] loaded');
}
