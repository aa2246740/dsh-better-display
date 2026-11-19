/** The mark to draw for one path. */
export type GlyphKind = 'image' | 'code' | 'document' | 'other';
/**
 * The mark the original view gives a file.
 * @param path - the referenced file.
 * @returns which glyph to draw.
 */
export declare function glyphKindOf(path: string): GlyphKind;
/**
 * The glyph for one file, drawn inline.
 *
 * `currentColor` throughout, so the mark takes the chip's link colour and needs no
 * second theme rule.
 * @param props - the destination whose extension picks the shape.
 */
export declare function FileGlyph({ path }: {
    path: string;
}): import("react").JSX.Element;
//# sourceMappingURL=file-glyph.d.ts.map