/**
 * The clickable chip for a file reference.
 *
 * The Host decides a link is a file from its destination alone, so a path the answer
 * only mentions still gets the chip and its icon. A mention, when the vocabulary has one,
 * supplies the opener and the exact title; otherwise the resolved path is enough. The
 * whole path lives in the chip's `title`, so hovering the truncated name still reports
 * the destination without adding a block under the sentence.
 *
 * @module
 */
import css from './MarkdownText.module.css';
import { FileGlyph } from './file-glyph.js';

/**
 * The chip for one file reference.
 * @param props - the destination, the label, the mention and the opener.
 */
export function FileChip({
  path,
  label,
  mention,
  open
}: {
  path: string;
  label: string;
  mention?: { title: string; label: string } | undefined;
  open: () => void;
}) {
  return (
    <button
      type="button"
      className={css.fileMention}
      title={mention?.title ?? path}
      aria-label={mention?.label ?? `打开 ${path}`}
      onClick={open}
    >
      <FileGlyph path={path} />
      {label === '' ? path : label}
    </button>
  );
}
