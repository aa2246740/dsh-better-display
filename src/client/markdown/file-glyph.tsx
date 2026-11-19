/**
 * The file marks the reading view puts in front of a file name.
 *
 * The Host draws these from a private icon set and picks one by extension: a code mark
 * for source, a picture mark for an image, a page for everything else. Using one glyph
 * for every kind is not the same rendering, which is what the reader noticed when
 * comparing the two views.
 *
 * Kept out of the renderer because it is a lookup table plus four static SVGs.
 *
 * @module
 */
import css from './MarkdownText.module.css';

/** Extensions the Host treats as a picture. */
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/iu;

/** Source extensions, so they get the code mark rather than a page. */
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'mjs',
  'cjs',
  'json',
  'css',
  'scss',
  'less',
  'html',
  'htm',
  'yml',
  'yaml',
  'toml',
  'sh',
  'bash',
  'ps1',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'rb',
  'php',
  'c',
  'h',
  'cc',
  'cpp',
  'hpp',
  'cs',
  'swift',
  'sql'
]);

/** Office and document extensions. */
const DOCUMENT_EXTENSIONS = new Set([
  'xls',
  'xlsx',
  'csv',
  'pdf',
  'ppt',
  'pptx',
  'doc',
  'docx',
  'odt',
  'ods',
  'odp'
]);

/** The mark to draw for one path. */
export type GlyphKind = 'image' | 'code' | 'document' | 'other';

/**
 * The mark the original view gives a file.
 * @param path - the referenced file.
 * @returns which glyph to draw.
 */
export function glyphKindOf(path: string): GlyphKind {
  if (IMAGE_FILE.test(path.split(/[?#]/u)[0] ?? path)) return 'image';
  const extension = /\.([a-z0-9]+)(?:[?#].*)?$/iu.exec(path)?.[1]?.toLowerCase() ?? '';
  if (extension === '') return 'other';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  if (DOCUMENT_EXTENSIONS.has(extension)) return 'document';
  return 'other';
}

/**
 * The glyph for one file, drawn inline.
 *
 * `currentColor` throughout, so the mark takes the chip's link colour and needs no
 * second theme rule.
 * @param props - the destination whose extension picks the shape.
 */
export function FileGlyph({ path }: { path: string }) {
  const kind = glyphKindOf(path);
  return (
    <svg
      className={css.linkIcon}
      viewBox="0 0 16 16"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      aria-hidden="true"
      focusable="false"
    >
      {kind === 'code' ? (
        <>
          <path d="M5.6 4.4 2.2 8l3.4 3.6" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M10.4 4.4 13.8 8l-3.4 3.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : kind === 'image' ? (
        <>
          <rect x="1.9" y="2.9" width="12.2" height="10.2" rx="2" />
          <circle cx="5.6" cy="6.2" r="1.05" fill="currentColor" stroke="none" />
          <path
            d="M2.7 11.6 6 8.5l2.5 2.1L11.3 7.5l2 1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : kind === 'document' ? (
        <>
          <path d="M4.1 1.9h4.8l3 3v9.2H4.1z" strokeLinejoin="round" />
          <path d="M8.9 1.9v3h3" strokeLinejoin="round" />
          <path d="M6 8.2h4M6 10.6h4" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M3.7 2.4h5.6l3 3v8.2h-8.6z" strokeLinejoin="round" />
          <path d="M9.3 2.4v3h3" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}
