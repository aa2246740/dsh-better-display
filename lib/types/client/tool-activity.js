/** Public Step data includes tool-only model output before a chat node exists. */
export function readerFlow(group, turn, get) {
    const flow = [];
    const calls = new Map();
    const assistantOrder = new Map();
    for (const key of group.keys) {
        const node = get(key);
        if (!node || node.visibility === 'hidden')
            continue;
        const step = node.location.kind === 'step' ? node.location.step.step : 0;
        if (node.kind === 'tool-call') {
            const block = node.data.root;
            calls.set(block.callId, { kind: 'tool', key: `reader-tool:${block.callId}`, callId: block.callId, step, block, order: node.anchorSeq });
        }
        else {
            flow.push({ kind: 'node', key, nodeKey: key, order: node.anchorSeq });
            if (node.kind === 'assistant-step')
                assistantOrder.set(step, node.anchorSeq);
        }
    }
    for (const step of turn?.steps ?? []) {
        const data = step.data.get('assistant-step');
        let index = 0;
        for (const draft of data?.blocks ?? []) {
            if (draft.kind !== 'tool-call' || !draft.callId)
                continue;
            const previous = calls.get(draft.callId);
            calls.set(draft.callId, previous ? { ...previous, draft } : {
                kind: 'tool', key: `reader-tool:${draft.callId}`, callId: draft.callId, step: step.step, draft,
                order: (assistantOrder.get(step.step) ?? step.start?.seq ?? 0) + .01 + index++ / 10000,
            });
        }
    }
    flow.push(...calls.values());
    return flow.sort((left, right) => left.order - right.order);
}
export function objectValue(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}
export function stringValue(record, ...keys) {
    for (const key of keys)
        if (typeof record?.[key] === 'string' && record[key])
            return record[key];
    return undefined;
}
/** Read only top-level JSON string values, including an unfinished final string.
 * This never executes input or mistakes escaped/nested content for a path field. */
export function inputFields(raw) {
    try {
        return objectValue(JSON.parse(raw)) ?? {};
    }
    catch { /* an in-flight argument is normally incomplete */ }
    const fields = Object.create(null);
    const prefix = raw.slice(0, 262144);
    let depth = 0;
    let key;
    for (let index = 0; index < prefix.length; index++) {
        const char = prefix[index];
        if (char === '{' || char === '[') {
            depth++;
            continue;
        }
        if (char === '}' || char === ']') {
            depth--;
            continue;
        }
        if (char !== '"')
            continue;
        const start = index;
        let closed = false;
        for (index++; index < prefix.length; index++) {
            if (prefix[index] === '\\') {
                index++;
                continue;
            }
            if (prefix[index] === '"') {
                closed = true;
                break;
            }
        }
        if (depth !== 1)
            continue;
        const token = prefix.slice(start, closed ? index + 1 : prefix.length);
        let value;
        try {
            value = JSON.parse(token);
        }
        catch {
            if (closed)
                continue;
            // Strip only an unfinished trailing escape/unicode escape, not content.
            let body = token.slice(1);
            const unicode = /(?<!\\)(?:\\\\)*\\u[\da-f]{0,3}$/i.exec(body);
            if (unicode)
                body = body.slice(0, unicode.index) + unicode[0].replace(/\\u[\da-f]{0,3}$/i, '');
            let slashes = 0;
            for (let end = body.length - 1; end >= 0 && body[end] === '\\'; end--)
                slashes++;
            if (slashes % 2)
                body = body.slice(0, -1);
            try {
                value = JSON.parse(`"${body}"`);
            }
            catch {
                continue;
            }
        }
        if (closed && /^\s*:/.test(prefix.slice(index + 1)))
            key = value;
        else if (key !== undefined) {
            fields[key] = value;
            key = undefined;
        }
    }
    return fields;
}
export function toolIdentity(entry) {
    const block = entry.block;
    return {
        name: block ? 'kind' in block ? block.call?.name ?? entry.draft?.name ?? '工具调用' : block.name : entry.draft?.name ?? '工具调用',
        raw: block ? 'kind' in block ? block.call?.argsRaw ?? entry.draft?.argsRaw ?? '' : ('argsRaw' in block ? block.argsRaw : '') : entry.draft?.argsRaw ?? '',
    };
}
/** Name and raw arguments of any call block, whether it has landed or is pending. */
function childIdentity(block) {
    if (!block || !('kind' in block))
        return { name: block?.name, raw: block && 'argsRaw' in block ? block.argsRaw : '' };
    return { name: block.call?.name, raw: block.call?.argsRaw ?? '' };
}
export function executionFacts(block) {
    if (!block || !('kind' in block))
        return {};
    const meta = objectValue(block.meta);
    const code = meta?.exitCode ?? meta?.exit_code;
    const text = block.content.length === 1 && block.content[0]?.type === 'text' ? block.content[0].text : '';
    const exit = /\n\[exit code: (\d+)\]$/.exec(text);
    const signal = /\n\[killed by signal: ([^\]\n]+)\]$/.exec(text);
    const parsedCode = exit?.[1] === undefined ? undefined : Number(exit[1]);
    return {
        exitCode: typeof code === 'number' && Number.isFinite(code) ? code : parsedCode,
        signal: stringValue(meta, 'signal') ?? signal?.[1],
    };
}
/** Line counts of one text side; a trailing newline does not start a line. */
function lineCount(text) {
    if (text === null)
        return 0;
    const body = text.endsWith('\n') ? text.slice(0, -1) : text;
    return body === '' ? 0 : body.split('\n').length;
}
/** Argument fields that carry the text a call is about to write. */
const NEW_TEXT_FIELDS = ['content', 'new_string', 'new_str', 'newText', 'file_text'];
/** Argument fields that carry the text a call is about to replace. */
const OLD_TEXT_FIELDS = ['old_string', 'old_str', 'oldText'];
/** Argument fields that name the file a mutation call targets. */
const PATH_FIELDS = ['file_path', 'path', 'filePath'];
function firstString(source, fields) {
    if (!source)
        return null;
    for (const field of fields) {
        const value = source[field];
        if (typeof value === 'string' && value !== '')
            return value;
    }
    return null;
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
export const DIFF_FALLBACK_TOOLS = ['write', 'edit', 'str_replace_editor'];
const MUTATION_TOOLS = new Set(DIFF_FALLBACK_TOOLS);
export function callDiffHunks(block, args, name) {
    // A parent call owns whatever its children changed: a script that writes files
    // reports those writes itself rather than through its own arguments, and the
    // digest must see them too. Without this the counts only ever appeared on the
    // nested row, which is what a reader noticed as a missing badge.
    // Each child contributes through its own arguments, not the parent's: a nested
    // write/edit records its hunks in `argsRaw`, and passing nothing here silently
    // dropped them from the parent total. Errors are contained so one unreadable
    // child cannot blank the whole row.
    const nested = block && 'kind' in block && Array.isArray(block.subCalls)
        ? block.subCalls.flatMap(child => {
            try {
                return callDiffHunks(child, inputFields(childIdentity(child).raw), childIdentity(child).name);
            }
            catch {
                return [];
            }
        })
        : [];
    if (block && 'kind' in block) {
        const diffs = objectValue(block.meta)?.diffs;
        if (Array.isArray(diffs) && diffs.length > 0) {
            const hunks = [];
            for (const raw of diffs) {
                const entry = objectValue(raw);
                if (!entry)
                    continue;
                const oldText = typeof entry.oldText === 'string' ? entry.oldText : null;
                const newText = typeof entry.newText === 'string' ? entry.newText : '';
                if (!lineCount(newText) && !lineCount(oldText))
                    continue;
                hunks.push({ path: firstString(entry, PATH_FIELDS) ?? '', oldText, newText });
            }
            if (hunks.length)
                return [...hunks, ...nested];
        }
    }
    // Several unrelated tools take a field named `content` (a memory note, a typed
    // message). Reading it as a file body invented counts for calls that changed no
    // file at all, so the name decides whether arguments may be read this way.
    if (!name || !MUTATION_TOOLS.has(name))
        return nested;
    const path = firstString(args, PATH_FIELDS);
    if (!path)
        return nested;
    const oldText = firstString(args, OLD_TEXT_FIELDS);
    const newText = firstString(args, NEW_TEXT_FIELDS) ?? '';
    if (!lineCount(newText) && !lineCount(oldText))
        return nested;
    return [{ path, oldText, newText }, ...nested];
}
/** Added/removed line counts for one call, or null when there is nothing to show. */
export function diffTotals(block, args, name) {
    const hunks = callDiffHunks(block, args, name);
    if (!hunks.length)
        return null;
    return diffLineTotals(hunks);
}
/** Counts the lines on each side, under the same rule the official block uses. */
export function diffLineTotals(hunks) {
    return hunks.reduce((total, hunk) => ({
        added: total.added + lineCount(hunk.newText),
        removed: total.removed + lineCount(hunk.oldText),
    }), { added: 0, removed: 0 });
}
/** Every changed file across a folded run of steps, in the order they ran. */
export function foldDiffHunks(steps) {
    const hunks = [];
    for (const step of steps) {
        if (step.kind !== 'tool' || !step.entry)
            continue;
        const model = activitySummary(step.entry);
        hunks.push(...callDiffHunks(step.entry.block, model.args, model.name));
    }
    return hunks;
}
export function activityPhase(entry, turnClosed = false) {
    if (!entry.block)
        return turnClosed ? 'interrupted' : 'preparing';
    if (!('kind' in entry.block))
        return turnClosed ? 'interrupted' : 'running';
    // RC1 publishes canonical cancellation as an error result with a typed code.
    if (entry.block.error?.code === 'ABORTED' || entry.block.error?.code === 'interrupted')
        return 'interrupted';
    const facts = executionFacts(entry.block);
    if (entry.block.isError || facts.signal || (facts.exitCode !== undefined && facts.exitCode !== 0)
        || entry.block.subCalls.some(block => activityPhase({ block }, turnClosed) === 'failed'))
        return 'failed';
    if (facts.exitCode === 0)
        return 'succeeded';
    return 'returned';
}
export function activitySummary(entry) {
    const { name, raw } = toolIdentity(entry);
    const args = inputFields(raw);
    const target = stringValue(args, 'file_path', 'path', 'filename', 'filePath');
    const command = stringValue(args, 'command', 'cmd', 'script');
    const description = stringValue(args, 'description');
    const file = target?.split(/[/\\]/).at(-1);
    const category = /^(write|edit|apply_patch|patch|str_replace_editor)$/.test(name) ? 'write'
        : /^(read|read_file)$/.test(name) ? 'read'
            : /^(bash|shell|terminal|terminal_send|exec_command|pwsh)$/.test(name) ? 'terminal'
                : /^(grep|glob|find|search)$/.test(name) ? 'search'
                    : /^(web_search|web_fetch|web_open)$/.test(name) ? 'web'
                        // Code interpreters: no file, no shell, no query — the call is a program.
                        // Without this branch `run_code` fell through to `other`, which has no
                        // renderer of its own, so its result text was emitted as ordinary prose
                        // and stayed outside every fold.
                        : /^(run_code|execute_code|code_interpreter|python|node|eval|repl)$/.test(name) ? 'code'
                            : 'other';
    const title = category === 'write' ? `${name === 'write' ? '写入' : '修改'}${file ? ` ${file}` : name === 'apply_patch' ? '代码补丁' : '文件'}`
        : category === 'read' ? `读取${file ? ` ${file}` : '文件'}`
            : category === 'terminal' ? description || '运行命令'
                : category === 'search' ? name === 'glob' ? '查找文件' : '搜索内容'
                    : category === 'web' ? name === 'web_search' ? '搜索网页' : '读取网页'
                        : category === 'code' ? (description || '运行代码')
                            : name;
    return { name, raw, args, category, title, target: target ?? command ?? stringValue(args, 'query', 'pattern', 'url'), command,
        cwd: stringValue(args, 'workdir', 'cwd'), content: stringValue(args, 'content', 'new_string', 'newText', 'file_text') };
}
export function preparingLabel(name) {
    return /^(write|edit|apply_patch)$/.test(name) ? '正在生成文件内容' : /^(bash|shell|exec_command|pwsh)$/.test(name) ? '正在准备命令' : '正在准备工具输入';
}
//# sourceMappingURL=tool-activity.js.map