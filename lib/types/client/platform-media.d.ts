/**
 * Local-image resolution for the Reader's Markdown renderer.
 *
 * Answers fetched from a model routinely point at local files — on Windows as
 * `C:\shots\plan.png`, sometimes URL-escaped (`C:\a%20b.png`) or carrying a
 * line locator (`notes.md:12`, `#L12`). The Harness file route serves bytes
 * only for an absolute path passed as `?path=`. Every destination is decoded,
 * stripped of its query, fragment and locator, then handed to the host's own
 * `resolveWorkspacePath` and `fileMediaUrl`. Those two functions are the same
 * gate the host chat view uses (`@deepseek-ai/dsh-util-workspace-path`,
 * identical `fileMediaUrl` on 0.2.1-rc.5 and 0.2.2-rc.5). The package is not
 * in the platform module table; the client build inlines it (`INLINE_SAFE`),
 * which is how this bundle already ships `abbreviateHomePath`.
 *
 * A path the host's `fileMediaUrl` refuses — UNC (`\\host\share`), a device
 * path (`\\?\`, `\\.\`), a protocol-relative URL, or the same shapes after
 * percent-decoding — never becomes an `api/file` URL. The check runs on the
 * decoded text and again on the path joined to the session workspace.
 *
 * Authorization stays Host-side: this module only names a URL.
 *
 * @module
 */
/**
 * Reduce an authored image destination to the local path it names.
 * @param value - authored destination, with or without `#L12` / `:12` suffixes.
 * @returns an absolute native path the host file route accepts, or undefined
 * when the destination is not one (a remote URL, a UNC path, a `data:` URL, …).
 */
export declare function localImagePath(value: string): string | undefined;
/**
 * Resolve an authored image destination against the Session workspace.
 * @param cwd - the Session's working directory, when the Host reported one.
 * @param value - authored destination.
 * @returns an absolute native path the host file route accepts, or undefined.
 */
export declare function resolveImagePath(cwd: string | undefined, value: string): string | undefined;
/**
 * Build the Harness file-route URL for one absolute path.
 * @param base - page base: an `http(s)` URL (deployment prefix included) or
 * `dsh-app://app/` in the desktop shell, exactly as `document.baseURI` holds it.
 * @param path - absolute native path, already decoded.
 * @param load - cache-busting counter for a lazily mounted image.
 * @returns the URL, or undefined for an unsupported transport or a path the
 * host's own `fileMediaUrl` refuses.
 */
export declare function fileMediaUrlForBase(base: string, path: string, load?: number): string | undefined;
/**
 * Build the file-route URL from a page protocol and a page origin.
 * @param protocol - page protocol (`http:`/`https:` in a browser, `dsh-app:`
 * in the desktop shell).
 * @param origin - page origin, or `dsh-app://app` for the desktop shell.
 * @param value - authored destination.
 * @param load - cache-busting counter for a lazily mounted image.
 * @returns the URL, or undefined for an unsupported transport or path.
 */
export declare function localPathMediaUrl(protocol: string, origin: string, value: string, load?: number): string | undefined;
/** The subset of `MarkdownPathImages` this module implements. */
export interface PathImageResolver {
    /** Resolve one authored destination; absent means "no displayable image". */
    resolve: (value: string) => string | undefined;
}
/**
 * Build a resolver bound to one Session workspace.
 * @param cwd - the Session's working directory, enabling relative paths.
 * @param base - page base URL; defaults to the live page's `document.baseURI`,
 * which carries both the desktop origin and any deployment prefix.
 * @returns a resolver the caller should memoize per (cwd, page) pair, because
 * a new identity discards the Markdown streaming render cache.
 */
export declare function readerPathImagesFor(cwd?: string, base?: string): PathImageResolver;
//# sourceMappingURL=platform-media.d.ts.map