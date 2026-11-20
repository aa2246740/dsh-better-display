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
const HEADERS = [
    ['*** Add File: ', 'add'],
    ['*** Update File: ', 'update'],
    ['*** Delete File: ', 'delete']
];
const MOVE = '*** Move to: ';
/**
 * Read the files a patch input names.
 * @param input - the `input` argument of an `apply_patch` call, complete or partial.
 * @returns the files in patch order, or an empty list when none is named yet.
 */
export function patchTargets(input) {
    if (input === undefined || input === '')
        return [];
    const lines = input.split('\n');
    // A final line with no newline after it may still be growing.
    if (!input.endsWith('\n'))
        lines.pop();
    const targets = [];
    for (const raw of lines) {
        const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
        if (line.startsWith(MOVE)) {
            const last = targets.at(-1);
            const to = line.slice(MOVE.length).trim();
            if (last?.kind === 'update' && last.from === undefined && to !== '') {
                targets[targets.length - 1] = { kind: 'update', path: to, label: to, from: last.label };
            }
            continue;
        }
        for (const [prefix, kind] of HEADERS) {
            if (!line.startsWith(prefix))
                continue;
            const path = line.slice(prefix.length).trim();
            if (path !== '')
                targets.push({ kind, path: kind === 'delete' ? undefined : path, label: path });
            break;
        }
    }
    return targets;
}
/**
 * One-line summary in the upstream format: files joined by `, `, and a move as `from → to`.
 * @param targets - files from {@link patchTargets}.
 * @param display - shortens one path for display (cwd/home relative).
 * @returns the summary, or an empty string when no file is named.
 */
export function patchSummary(targets, display = path => path) {
    return targets
        .map(target => target.from === undefined
        ? display(target.label)
        : `${display(target.from)} → ${display(target.label)}`)
        .join(', ');
}
/**
 * Whether settled result metadata marks a call that stopped before every requested effect
 * (the 0.2.2 `apply_patch` `meta.stopped` flag). Official rows show such a call as an error.
 * @param meta - opaque result metadata.
 * @returns true only for an explicit `stopped: true`.
 */
export function stoppedFromMeta(meta) {
    return (typeof meta === 'object' &&
        meta !== null &&
        !Array.isArray(meta) &&
        meta.stopped === true);
}
//# sourceMappingURL=patch-targets.js.map