/**
 * Files named by an `apply_patch` call (Harness 0.2.2), read from its header lines.
 *
 * Upstream `tool-call-model.ts` runs `parsePatch` from `@deepseek-ai/dsh-fs-patch`
 * for the row summary. Reader needs only the file names for a display label, so
 * it reads the four header forms and does not depend on that package:
 *
 *   *** Add File: <path>
 *   *** Update File: <path>
 *   *** Move to: <path>      (directly after an Update header)
 *   *** Delete File: <path>
 *
 * Unlike upstream, it also reads a patch that is still streaming. That patch has
 * no closing `*** End Patch` and may end mid-header, so the last header counts
 * only once its line has a newline after it.
 */
/** One file a patch names. `from` is set only for a move. */
export interface PatchTarget {
    readonly kind: 'add' | 'update' | 'delete';
    /** Openable path: the file itself, or a move's destination. Deletions have none. */
    readonly path: string | undefined;
    /** Display label: the file, or a move's destination. */
    readonly label: string;
    /** A move's source. */
    readonly from?: string;
}
/**
 * Read the files a patch input names.
 * @param input - the `input` argument of an `apply_patch` call, complete or partial.
 * @returns the files in patch order, or an empty list when none is named yet.
 */
export declare function patchTargets(input: string | undefined): PatchTarget[];
/**
 * One-line summary in the upstream format: files joined by `, `, and a move as `from → to`.
 * @param targets - files from {@link patchTargets}.
 * @param display - shortens one path for display (cwd/home relative).
 * @returns the summary, or an empty string when no file is named.
 */
export declare function patchSummary(targets: readonly PatchTarget[], display?: (path: string) => string): string;
/**
 * Whether settled result metadata marks a call that stopped before every requested effect
 * (the 0.2.2 `apply_patch` `meta.stopped` flag). Official rows show such a call as an error.
 * @param meta - opaque result metadata.
 * @returns true only for an explicit `stopped: true`.
 */
export declare function stoppedFromMeta(meta: unknown): boolean;
//# sourceMappingURL=patch-targets.d.ts.map