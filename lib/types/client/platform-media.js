/**
 * Local-image resolution for the Reader's Markdown renderer.
 *
 * Answers fetched from a model routinely point at local files — on Windows as
 * `C:\shots\plan.png`, sometimes URL-escaped (`C:\a%20b.png`) or carrying a
 * line locator (`notes.md:12`, `#L12`). The Harness file route serves bytes
 * only for an absolute path passed as `?path=`, so every destination is
 * decoded once, stripped of its locator, validated, and then rewritten into
 * that route. Relative destinations resolve against the Session workspace.
 *
 * Authorization stays Host-side: this module only names a URL.
 *
 * @module
 */
/** Absolute-path spellings the Host file route accepts. */
const ABSOLUTE = /^(?:\/|[A-Za-z]:[/\\]|\\\\)/u;
/** Trailing `:12` / `:12-20` locator, as authored after a path. */
const COLON_LOCATOR = /:(\d+)(?::\d+|-(\d+))?$/u;
/**
 * Whether a destination carries a character that never names a real file and
 * would corrupt the query. Spelled as a code-unit scan instead of a literal
 * control-character regex class, so the intent stays readable.
 * @param value - candidate path text.
 * @returns true when any code unit is a C0 control or DEL.
 */
function hasControlCharacter(value) {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        if (code < 0x20 || code === 0x7f)
            return true;
    }
    return false;
}
/**
 * Decode one authored destination exactly once.
 * @param value - destination as the Markdown author wrote it.
 * @returns the decoded text, or the raw text when it is not valid escaping
 * (a literal `%` in a filename must not make the image disappear).
 */
function decodeOnce(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return value;
    }
}
/**
 * Reduce an authored image destination to the local path it names.
 * @param value - authored destination, with or without `#L12` / `:12` suffixes.
 * @returns an absolute native path, or undefined when the destination is not
 * a local path (a remote URL, a `data:` URL, a bare word, …).
 */
export function localImagePath(value) {
    if (typeof value !== 'string')
        return undefined;
    const hash = value.indexOf('#');
    const withoutFragment = hash < 0 ? value : value.slice(0, hash);
    let path = decodeOnce(withoutFragment);
    if (path.length === 0 || hasControlCharacter(path))
        return undefined;
    // `//host/x.png` is a protocol-relative URL, never a file path. A Windows
    // UNC path (`\\host\share`) keeps its double backslash.
    if (path.startsWith('//'))
        return undefined;
    // A trailing locator is display metadata, not part of the filename.
    const locator = COLON_LOCATOR.exec(path);
    if (locator !== null) {
        const stripped = path.slice(0, locator.index);
        // Keep `C:` itself: only a stripped absolute path is a real path.
        if (ABSOLUTE.test(stripped))
            path = stripped;
    }
    if (!ABSOLUTE.test(path))
        return undefined;
    return path;
}
/**
 * Resolve an authored image destination against the Session workspace.
 * @param cwd - the Session's working directory, when the Host reported one.
 * @param value - authored destination.
 * @returns an absolute native path, or undefined when it names none.
 */
export function resolveImagePath(cwd, value) {
    const direct = localImagePath(value);
    if (direct !== undefined)
        return direct;
    if (cwd === undefined || cwd === '')
        return undefined;
    const hash = value.indexOf('#');
    const authored = (hash < 0 ? value : value.slice(0, hash)).trim();
    if (authored.length === 0 || hasControlCharacter(authored))
        return undefined;
    // A relative destination must stay inside the workspace spelling; anything
    // with a scheme, a leading slash, or a `//host` root is not one.
    if (/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(authored) || /^[/\\]/u.test(authored))
        return undefined;
    const relative = decodeOnce(authored).replace(/^\.\/+/u, '');
    if (relative.length === 0 || hasControlCharacter(relative))
        return undefined;
    const windows = /^[A-Za-z]:|^\\\\/u.test(cwd);
    const separator = windows ? '\\' : '/';
    const root = cwd.replace(/[/\\]+$/u, '');
    const tail = relative.replace(/^[/\\]+/u, '');
    return `${root}${separator}${windows ? tail.replaceAll('/', '\\') : tail}`;
}
/**
 * Build the Harness file-route URL for one absolute path.
 * @param base - page base: an `http(s)` URL (deployment prefix included) or
 * `dsh-app://app/` in the desktop shell, exactly as `document.baseURI` holds it.
 * @param path - absolute native path, already decoded.
 * @param load - cache-busting counter for a lazily mounted image.
 * @returns the URL, or undefined for an unsupported transport or path.
 */
export function fileMediaUrlForBase(base, path, load) {
    if (!/^https?:/u.test(base) && !base.startsWith('dsh-app://app/'))
        return undefined;
    const cache = load === undefined ? '' : `&load=${load}`;
    try {
        return new URL(`api/file?path=${encodeURIComponent(path)}${cache}`, base).href;
    }
    catch {
        return undefined;
    }
}
/**
 * Build the file-route URL from a page protocol and a page origin.
 * @param protocol - page protocol (`http:`/`https:` in a browser, `dsh-app:`
 * in the desktop shell).
 * @param origin - page origin, or `dsh-app://app` for the desktop shell.
 * @param value - authored destination.
 * @param load - cache-busting counter for a lazily mounted image.
 * @returns the URL, or undefined for an unsupported transport or path.
 */
export function localPathMediaUrl(protocol, origin, value, load) {
    const path = localImagePath(value);
    if (path === undefined)
        return undefined;
    if (protocol === 'http:' || protocol === 'https:') {
        return fileMediaUrlForBase(`${origin}/`, path, load);
    }
    // The desktop shell serves the same route under its application origin.
    if (protocol === 'dsh-app:' && origin === 'dsh-app://app') {
        return fileMediaUrlForBase('dsh-app://app/', path, load);
    }
    return undefined;
}
/**
 * Build a resolver bound to one Session workspace.
 * @param cwd - the Session's working directory, enabling relative paths.
 * @param base - page base URL; defaults to the live page's `document.baseURI`,
 * which carries both the desktop origin and any deployment prefix.
 * @returns a resolver the caller should memoize per (cwd, page) pair, because
 * a new identity discards the Markdown streaming render cache.
 */
export function readerPathImagesFor(cwd, base) {
    const page = base ?? (typeof document === 'undefined' ? undefined : document.baseURI);
    return {
        resolve: (value) => {
            if (page === undefined)
                return undefined;
            const path = resolveImagePath(cwd, value);
            if (path === undefined)
                return undefined;
            return fileMediaUrlForBase(page, path);
        }
    };
}
//# sourceMappingURL=platform-media.js.map