import type { AssistantBlock, ToolCallBlock, TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ReaderGroup } from './projection.js';
export type ToolDraft = Extract<AssistantBlock, {
    kind: 'tool-call';
}>;
export type ToolPhase = 'preparing' | 'running' | 'returned' | 'succeeded' | 'failed' | 'interrupted';
export type ToolCategory = 'write' | 'read' | 'terminal' | 'search' | 'web' | 'code' | 'other';
export interface ToolActivityEntry {
    kind: 'tool';
    key: string;
    callId: string;
    step: number;
    order: number;
    draft?: ToolDraft;
    block?: ToolCallBlock;
}
export type ReaderFlowEntry = ToolActivityEntry | {
    kind: 'node';
    key: string;
    nodeKey: string;
    order: number;
};
/** Public Step data includes tool-only model output before a chat node exists. */
export declare function readerFlow(group: ReaderGroup, turn: TurnLocation | undefined, get: (key: string) => ChatConversationViewNode | undefined): ReaderFlowEntry[];
export declare function objectValue(value: unknown): Record<string, unknown> | null;
export declare function stringValue(record: Record<string, unknown> | null, ...keys: string[]): string | undefined;
/** Read only top-level JSON string values, including an unfinished final string.
 * This never executes input or mistakes escaped/nested content for a path field. */
export declare function inputFields(raw: string): Record<string, unknown>;
export declare function toolIdentity(entry: Pick<ToolActivityEntry, 'block' | 'draft'>): {
    name: string;
    raw: string;
};
export declare function executionFacts(block: ToolCallBlock | undefined): {
    exitCode?: number;
    signal?: string;
};
/**
 * Added/removed line counts for a mutation call, or null when there is no diff
 * to show.
 *
 * The result metadata is preferred when the host attaches one. Not every host
 * build does — a session log may carry no hunk payload at all — so the call's own
 * arguments are read as the fallback, which is also what the official row uses
 * while a write is still pending. A call whose arguments hold none of these
 * fields (a read, a listing) yields null and shows no badge.
 */
/**
 * One changed file, in the exact shape the official `DiffBlock` primitive takes:
 * `oldText` is null for a pure insertion, and `newText` is always a string. Line
 * counts are derived from these two sides, never stored alongside them.
 */
export interface DiffHunk {
    path: string;
    oldText: string | null;
    newText: string;
}
/**
 * The changed files of a mutation call.
 *
 * Result metadata is preferred when the host attaches it. Not every host build
 * does, so the call's own arguments are the fallback — the same source the
 * official row reads while a write is still pending. A call whose arguments hold
 * none of these fields (a read, a listing) yields nothing and shows no counts.
 */
/** Only these tools change a file, so only these may fall back to their arguments. */
export declare const DIFF_FALLBACK_TOOLS: readonly ["write", "edit", "str_replace_editor"];
export declare function callDiffHunks(block: ToolCallBlock | undefined, args?: Record<string, unknown>, name?: string): DiffHunk[];
/** Added/removed line counts for one call, or null when there is nothing to show. */
export declare function diffTotals(block: ToolCallBlock | undefined, args?: Record<string, unknown>, name?: string): {
    added: number;
    removed: number;
} | null;
/** Counts the lines on each side, under the same rule the official block uses. */
export declare function diffLineTotals(hunks: readonly DiffHunk[]): {
    added: number;
    removed: number;
};
/** Every changed file across a folded run of steps, in the order they ran. */
export declare function foldDiffHunks(steps: readonly {
    kind: string;
    entry?: ToolActivityEntry;
}[]): DiffHunk[];
export declare function activityPhase(entry: Pick<ToolActivityEntry, 'block' | 'draft'>, turnClosed?: boolean): ToolPhase;
/**
 * Session-stamped start of a call, or null while only a draft exists.
 * A settled result carries `callTime`, the paired tool/call event's time; a
 * still-running call head stamps the same instant in its own `time` field.
 */
export declare function callStartTime(entry: Pick<ToolActivityEntry, 'block'>): number | null;
/**
 * The instant a still-running call's elapsed clock counts from. The stamped
 * time wins so a remounted view keeps counting from the real start; an
 * un-stamped draft falls back to when this view first saw that call id, which
 * survives remounts for the same reason.
 */
export declare function runningClockBase(callId: string, block: ToolCallBlock | undefined, now?: number): number;
/** Forget a call's first-seen time once its clock is no longer live. */
export declare function forgetCallClock(callId: string): void;
export declare function activitySummary(entry: Pick<ToolActivityEntry, 'block' | 'draft'>): {
    name: string;
    raw: string;
    args: Record<string, unknown>;
    category: ToolCategory;
    title: string;
    target: string | undefined;
    command: string | undefined;
    cwd: string | undefined;
    content: string | undefined;
};
export declare function preparingLabel(name: string): string;
//# sourceMappingURL=tool-activity.d.ts.map