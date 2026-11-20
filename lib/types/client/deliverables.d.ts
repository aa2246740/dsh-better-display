import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ReaderFlowEntry } from './tool-activity.js';
/** Extract standard filename without directory components. */
export declare function basename(path: string): string;
/** Extract parent directory of a path (or '.' if top-level). */
export declare function dirname(path: string): string;
/**
 * The produced-files chip row waits for turn close. Live writes still
 * accumulate, but the row must not interrupt an in-progress process.
 */
export declare function showDeliverablesRow(status: 'open' | 'closed' | 'unknown', paths: readonly string[]): boolean;
/**
 * Extract all unique file paths produced/modified in one turn.
 * Respects official deliverables data when available, and falls back to
 * inspecting successful write/edit tool invocations in the turn flow.
 */
export declare function getTurnDeliverables(turn: TurnLocation | undefined, flow?: readonly ReaderFlowEntry[]): readonly string[];
//# sourceMappingURL=deliverables.d.ts.map