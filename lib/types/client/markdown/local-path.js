/**
 * Whether an inline-code token is specific enough to be a file reference.
 *
 * The Host's vocabulary also resolves a bare file name, so a token like `deliverables.ts`
 * becomes a chip whenever this turn happened to write that file. The original view leaves
 * such a token as plain code: a sentence naming a file in passing is not offering a link.
 * A token qualifies only when it carries a separator itself, or is exactly the whole path
 * the vocabulary resolved.
 * @param token - the authored inline-code value.
 * @param resolved - the path the vocabulary matched.
 * @returns true when the token names a path in its own right.
 */
export function looksLikePathToken(token, resolved) {
    return /[/\\]/u.test(token) || token === resolved;
}
/**
 * Whether a link's destination names a local file.
 *
 * The Host decides this from the destination alone: a link is a file when it decodes to
 * a path and is not a parseable URL. It does not consult a list of known files, and that
 * is why a path the answer merely mentions still becomes a chip. The plugin used to
 * require the file to appear in the turn's deliverables, so paths like
 * `G:\...\sysupgrade.bin` rendered as plain anchors with no chip and no path box.
 *
 * @module
 */
/**
 * Control characters make a "path" unusable, and the Host rejects them too.
 *
 * Built from code points rather than written literally: a control character in a regex
 * literal trips `no-control-regex`, and the class is unreadable there anyway.
 */
const CONTROL = new RegExp(`[${String.fromCharCode(0)}-${String.fromCharCode(0x1f)}${String.fromCharCode(0x7f)}]`, 'u');
/** A trailing `:12` or `:12-20` is a line reference, not part of the path. */
const LINE_SUFFIX = /:(\d+)(?::\d+|-(\d+))?$/u;
/**
 * Decode a destination once, tolerating a stray `%`.
 * @param value - the authored destination.
 * @returns the decoded text, or undefined when it cannot be decoded.
 */
function decodeOnce(value) {
    try {
        return decodeURIComponent(value);
    }
    catch {
        return undefined;
    }
}
/**
 * Whether a destination is a URL rather than a path.
 *
 * `URL.canParse` alone is not enough: it accepts `G:\dir\file.bin`, treating `G:` as the
 * scheme, so a Windows path would be rejected as a link. A single-letter scheme followed
 * by a separator is a drive letter, not a URL.
 * @param value - the decoded destination.
 * @returns true when the value is a URL.
 */
function isUrl(value) {
    // A drive letter: `C:`, `G:` … never a scheme the Host serves.
    if (/^[a-z]:[\\/]/iu.test(value))
        return false;
    // A UNC path: `\\host\share\…`.
    if (value.startsWith('\\\\'))
        return false;
    return URL.canParse(value);
}
/**
 * Whether a destination names a local file rather than a URL.
 *
 * Mirrors the Host: strip the fragment, decode, reject control characters, and reject
 * anything a URL parser accepts. A Windows drive letter survives because it is checked
 * before the URL parser sees it.
 * @param destination - the authored destination.
 * @returns the path with any line suffix removed, or undefined when it is not a file.
 */
export function localFilePath(destination) {
    const hash = destination.indexOf('#');
    const withoutFragment = hash < 0 ? destination : destination.slice(0, hash);
    // A query string means the destination is a URL, not a path.
    if (withoutFragment.includes('?'))
        return undefined;
    const decoded = decodeOnce(withoutFragment);
    if (decoded === undefined)
        return undefined;
    if (decoded.length === 0 || CONTROL.test(decoded))
        return undefined;
    if (isUrl(decoded))
        return undefined;
    const suffix = LINE_SUFFIX.exec(decoded);
    if (suffix === null)
        return decoded;
    const stripped = decoded.slice(0, -suffix[0].length);
    return stripped.length === 0 ? undefined : stripped;
}
//# sourceMappingURL=local-path.js.map