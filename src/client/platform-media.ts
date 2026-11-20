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

import {
  fileMediaUrl,
  isAbsoluteWorkspacePath,
  resolveWorkspacePath
} from '@deepseek-ai/dsh-util-workspace-path';

/** Trailing `:12` / `:12-20` locator, as authored after a path. */
const COLON_LOCATOR = /:(\d+)(?::\d+|-(\d+))?$/u;
/** UNC, device, and protocol-relative roots. The host file route refuses these. */
const UNC_OR_DEVICE = /^[/\\]{2}/u;
/** A URL scheme. A Windows drive letter (`C:`) is not one. */
const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/u;
const DRIVE_PREFIX = /^[A-Za-z]:/u;
/** Base used only to ask the host helper whether a path is admissible. */
const PATH_GATE = 'https://host.invalid/';

/**
 * Whether a destination carries a character that never names a real file and
 * would corrupt the query. Spelled as a code-unit scan instead of a literal
 * control-character regex class, so the intent stays readable.
 * @param value - candidate path text.
 * @returns true when any code unit is a C0 control or DEL.
 */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/**
 * Decode one authored destination exactly once.
 * @param value - destination as the Markdown author wrote it.
 * @returns the decoded text, or undefined when the escaping is not valid.
 */
function decodeOnce(value: string): string | undefined {
  try {
    return decodeURIComponent(value);
  } catch {
    return undefined;
  }
}

/**
 * Whether one more decode would reveal a UNC, device, or control path.
 * `%5C%5C` is caught by the first decode. `%255C%255C` is not, until this pass.
 * @param value - path text that has already been decoded once.
 * @returns true when a second decode is hostile.
 */
function secondDecodeIsHostile(value: string): boolean {
  if (!value.includes('%')) return false;
  const again = decodeOnce(value);
  if (again === undefined || again === value) return false;
  return UNC_OR_DEVICE.test(again) || hasControlCharacter(again);
}

/**
 * Whether the host file route must refuse this path.
 * @param value - decoded path, before or after joining the workspace.
 * @returns true when the path is empty, a UNC/device root, a control string,
 * or a double-encoded form of those.
 */
function hostilePath(value: string): boolean {
  return (
    value.length === 0 ||
    hasControlCharacter(value) ||
    UNC_OR_DEVICE.test(value) ||
    secondDecodeIsHostile(value)
  );
}

/**
 * Drop the query and fragment the way the host's `localPathMediaUrl` does,
 * then decode. A literal `%` that is not valid escaping stays, so a filename
 * that contains one does not disappear.
 * @param value - authored destination.
 * @returns decoded path text, or undefined when nothing remains.
 */
function decodedDestination(value: string): string | undefined {
  const cut = value.search(/[?#]/u);
  const head = cut < 0 ? value : value.slice(0, cut);
  if (head.length === 0) return undefined;
  return decodeOnce(head) ?? head;
}

/**
 * Reduce an authored destination to the path text the file route should see,
 * including a relative path. Line locators stay display metadata.
 * @param value - authored destination.
 * @returns decoded path text, or undefined when it is hostile or empty.
 */
function authoredPath(value: string): string | undefined {
  if (typeof value !== 'string') return undefined;
  let path = decodedDestination(value);
  if (path === undefined || hostilePath(path)) return undefined;
  const locator = COLON_LOCATOR.exec(path);
  if (locator !== null) {
    const stripped = path.slice(0, locator.index);
    // Keep `C:` itself: only a stripped absolute path is a real path.
    if (stripped.length > 0 && isAbsoluteWorkspacePath(stripped) && !hostilePath(stripped)) {
      path = stripped;
    }
  }
  return hostilePath(path) ? undefined : path;
}

/** A `scheme:` destination that is not a Windows drive prefix. */
function isUrlScheme(value: string): boolean {
  return URL_SCHEME.test(value) && !DRIVE_PREFIX.test(value);
}

/**
 * Reduce an authored image destination to the local path it names.
 * @param value - authored destination, with or without `#L12` / `:12` suffixes.
 * @returns an absolute native path the host file route accepts, or undefined
 * when the destination is not one (a remote URL, a UNC path, a `data:` URL, …).
 */
export function localImagePath(value: string): string | undefined {
  const path = authoredPath(value);
  if (path === undefined || !isAbsoluteWorkspacePath(path)) return undefined;
  return fileMediaUrl(PATH_GATE, path) === undefined ? undefined : path;
}

/**
 * Resolve an authored image destination against the Session workspace.
 * @param cwd - the Session's working directory, when the Host reported one.
 * @param value - authored destination.
 * @returns an absolute native path the host file route accepts, or undefined.
 */
export function resolveImagePath(cwd: string | undefined, value: string): string | undefined {
  const direct = authoredPath(value);
  if (direct === undefined || isUrlScheme(direct)) return undefined;
  // `./` stripping differs between 0.2.1 and 0.2.2 `resolveWorkspacePath`.
  // Drop it here so both linked copies join the same way, then let the host
  // helper do the join. The host helper returns a UNC workspace unchanged.
  const normalized = direct.replace(/^(?:\.\/|\.\\)+/u, '');
  const resolved = resolveWorkspacePath(cwd, normalized);
  if (hostilePath(resolved) || fileMediaUrl(PATH_GATE, resolved) === undefined) return undefined;
  return resolved;
}

/**
 * Build the Harness file-route URL for one absolute path.
 * @param base - page base: an `http(s)` URL (deployment prefix included) or
 * `dsh-app://app/` in the desktop shell, exactly as `document.baseURI` holds it.
 * @param path - absolute native path, already decoded.
 * @param load - cache-busting counter for a lazily mounted image.
 * @returns the URL, or undefined for an unsupported transport or a path the
 * host's own `fileMediaUrl` refuses.
 */
export function fileMediaUrlForBase(base: string, path: string, load?: number): string | undefined {
  if (hostilePath(path)) return undefined;
  const url = fileMediaUrl(base, path);
  if (url === undefined || load === undefined) return url;
  const fresh = new URL(url);
  fresh.search = `${fresh.search === '' ? '?' : `${fresh.search}&`}load=${load}`;
  return fresh.href;
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
export function localPathMediaUrl(
  protocol: string,
  origin: string,
  value: string,
  load?: number
): string | undefined {
  const path = localImagePath(value);
  if (path === undefined) return undefined;
  if (protocol === 'http:' || protocol === 'https:') {
    return fileMediaUrlForBase(`${origin}/`, path, load);
  }
  // The desktop shell serves the same route under its application origin.
  if (protocol === 'dsh-app:' && origin === 'dsh-app://app') {
    return fileMediaUrlForBase('dsh-app://app/', path, load);
  }
  return undefined;
}

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
export function readerPathImagesFor(cwd?: string, base?: string): PathImageResolver {
  const page = base ?? (typeof document === 'undefined' ? undefined : document.baseURI);
  return {
    resolve: (value: string) => {
      if (page === undefined) return undefined;
      const path = resolveImagePath(cwd, value);
      if (path === undefined) return undefined;
      return fileMediaUrlForBase(page, path);
    }
  };
}
