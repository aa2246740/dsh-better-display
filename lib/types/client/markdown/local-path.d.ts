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
export declare function looksLikePathToken(token: string, resolved: string): boolean;
/**
 * Whether a destination names a local file rather than a URL.
 *
 * Mirrors the Host: strip the fragment, decode, reject control characters, and reject
 * anything a URL parser accepts. A Windows drive letter survives because it is checked
 * before the URL parser sees it.
 * @param destination - the authored destination.
 * @returns the path with any line suffix removed, or undefined when it is not a file.
 */
export declare function localFilePath(destination: string): string | undefined;
//# sourceMappingURL=local-path.d.ts.map