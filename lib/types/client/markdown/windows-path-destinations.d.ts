import type { Extension } from 'mdast-util-from-markdown';
/**
 * CommonMark reads `\.` or `\_` in a destination as an escaped character, so
 * `D:\repo\.github` would parse as `D:\repo.github`. For a destination that
 * is a Windows path, this `fromMarkdown` extension keeps every backslash
 * literally, including one before punctuation such as `\(`, while character
 * references such as `&amp;` still decode; other destinations parse unchanged.
 * @returns The mdast extension.
 */
export declare function windowsPathDestinations(): Extension;
//# sourceMappingURL=windows-path-destinations.d.ts.map