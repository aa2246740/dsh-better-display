import { type SpawnOptions } from 'node:child_process';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Context } from '@deepseek-ai/cordis';
export declare function revealRoots(ctx: Context, sessionId: string | undefined): Promise<readonly string[]>;
export declare function resolveRevealPath(path: string, roots: readonly string[], exists?: typeof existsSync): string;
export declare function revealPath(path: string, platform?: NodeJS.Platform, spawnProcess?: (command: string, args: string[], options: SpawnOptions) => unknown): void;
export declare function createRevealHandler({ roots, reveal }: {
    roots: (sessionId: string | undefined) => Promise<readonly string[]>;
    reveal?: (path: string) => void;
}): (req: IncomingMessage, res: ServerResponse) => void;
//# sourceMappingURL=reveal.d.ts.map