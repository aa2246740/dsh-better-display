/**
 * Pure helpers for the picture pager.
 *
 * Kept apart from `image-group.tsx` so the wording and the stepping rules can be
 * asserted without a DOM: the component holds React state, this holds the rules.
 *
 * A group is what the reader is looking at, not what the document holds:
 *
 *  - a picture produced by a tool call stands alone, because one call yields one
 *    picture;
 *  - every picture inside one answer forms a group, so `2/5` counts that
 *    answer's pictures.
 *
 * @module
 */

/** One member of a page group. */
export interface GroupEntry {
  /** Registration key. */
  id: string;
  /** The enlarged URL, used to keep the viewer showing the right picture. */
  src: string;
}

/** A page group in registration order. */
export interface GroupState {
  entries: readonly GroupEntry[];
}

/** No group: a lone picture. */
export const IDLE_GROUP: GroupState = { entries: [] };

/**
 * Where a drag leaves the picture.
 *
 * Dragging combines two layers: `scrollLeft`/`scrollTop`, which the browser
 * clamps to the scrollable range, and a free displacement for the part the range
 * cannot express.
 *
 * The picture stays where the reader put it. An earlier version snapped the free
 * layer back to zero on release, which made every drag of a picture smaller than
 * the stage spring home and feel broken. The only limit is that a sliver must
 * remain on screen, so a picture cannot be lost: `visibleFraction` is how much of
 * the stage stays covered.
 * @param input - the requested offset, the scroll range, and the current free offset.
 * @returns the clamped scroll offset and the free displacement to keep.
 */
export function settleDrag(input: {
  /** Requested scroll offset after the drag. */
  wantLeft: number;
  wantTop: number;
  /** Scrollable extent, `scrollWidth - clientWidth`. */
  maxLeft: number;
  maxTop: number;
  /** Free displacement before this drag started. */
  freeX: number;
  freeY: number;
  /** Set when the pointer is released. */
  release: boolean;
  /**
   * How much of the PICTURE must still be on screen, `0..1`.
   *
   * Only consulted on release. `0.15` keeps a sliver visible without preventing
   * the reader from parking the picture at an edge.
   */
  visibleFraction?: number;
  /** Stage size. */
  viewWidth?: number;
  /** Stage size. */
  viewHeight?: number;
  /** Rendered picture size. */
  pictureWidth?: number;
  /** Rendered picture size. */
  pictureHeight?: number;
  /**
   * Where the picture sits with `free` at zero, relative to the stage's top-left.
   *
   * The stage centres a picture smaller than itself, so that resting position is
   * `(viewWidth - pictureWidth) / 2`, not `0`. Ignoring this offset was the
   * asymmetry bug: the bounds were correct about the picture but were applied to
   * an origin the picture never sat at, so the free range ran from −85 to +385 and
   * dragging left died almost immediately while dragging right felt free.
   */
  restX?: number;
  /** Resting position on the vertical axis, see {@link restX}. */
  restY?: number;
}): { left: number; top: number; freeX: number; freeY: number } {
  const left = Math.min(Math.max(0, input.maxLeft), Math.max(0, input.wantLeft));
  const top = Math.min(Math.max(0, input.maxTop), Math.max(0, input.wantTop));
  // While dragging, whatever the clamp refused stays as free displacement, so the
  // picture follows the pointer even past its own edge.
  //
  // The sign follows the pointer, not the offset. `left` is a scroll position, so
  // an offset below `wantLeft` means the picture slid right; the free layer must
  // therefore undo that difference, or the two layers fight and the picture moves
  // against the hand. That inverted sign only showed at zoom < 100%, where the
  // whole displacement goes through this layer.
  let freeX = input.freeX + (left - input.wantLeft);
  let freeY = input.freeY + (top - input.wantTop);
  if (!input.release) return { left, top, freeX, freeY };
  // On release the picture keeps its position; it is only pulled back far enough
  // that a sliver of the picture itself stays visible.
  const keep = input.visibleFraction ?? 0.15;
  const viewWidth = input.viewWidth ?? 0;
  const viewHeight = input.viewHeight ?? 0;
  const pictureWidth = input.pictureWidth ?? 0;
  const pictureHeight = input.pictureHeight ?? 0;
  if (viewWidth > 0 && pictureWidth > 0) {
    // The picture's left edge sits at `restX + freeX`. Requiring
    // `keep * pictureWidth` of the picture to stay inside the view means:
    //   restX + freeX + pictureWidth >= keep * pictureWidth   (right edge inside)
    //   restX + freeX <= viewWidth - keep * pictureWidth      (left edge inside)
    const restX = input.restX ?? (viewWidth - pictureWidth) / 2;
    const minFreeX = keep * pictureWidth - pictureWidth - restX;
    const maxFreeX = viewWidth - keep * pictureWidth - restX;
    freeX = Math.min(maxFreeX, Math.max(minFreeX, freeX));
  }
  if (viewHeight > 0 && pictureHeight > 0) {
    const restY = input.restY ?? (viewHeight - pictureHeight) / 2;
    const minFreeY = keep * pictureHeight - pictureHeight - restY;
    const maxFreeY = viewHeight - keep * pictureHeight - restY;
    freeY = Math.min(maxFreeY, Math.max(minFreeY, freeY));
  }
  return { left, top, freeX, freeY };
}

/**
 * The label for a tool-call attachment.
 *
 * The Host stores only a display name and strips local path information on purpose
 * (`ImageAttachmentRef.name` — "stripped of local path information"), so a full path
 * cannot be recovered for an attached image. What can be improved is the extension: a
 * name like `shot` is shown as `shot.png`, derived from the verified media type, so the
 * caption at least carries a file name with a suffix.
 * @param name - the attachment's display name, possibly without an extension.
 * @param mediaType - the media type verified from the stored bytes.
 * @param fallback - what to show when there is no name at all.
 */
export function attachmentLabel(
  name: string | undefined,
  mediaType: string | undefined,
  fallback = '工具调用图片'
): string {
  const trimmed = name?.trim();
  if (trimmed === undefined || trimmed === '') return fallback;
  if (/\.[a-z0-9]{2,5}$/iu.test(trimmed)) return trimmed;
  const extension = mediaType === undefined ? '' : (EXTENSIONS[mediaType] ?? '');
  return extension === '' ? trimmed : `${trimmed}.${extension}`;
}

/** The common image media types, mapped to the extension a file name would carry. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
  'image/svg+xml': 'svg'
};

/**
 * What a title bar shows for a picture.
 *
 * A tool attachment may carry no file name, and a Markdown picture may carry no
 * destination, so the fallback chain has to end somewhere non-blank.
 * @param destination - the authored path, when there is one.
 * @param alt - alternative text, the next best description.
 * @returns text safe to render in the caption.
 */
export function groupCaption(destination: string | undefined, alt: string): string {
  const path = destination?.trim();
  if (path !== undefined && path !== '') return path;
  const text = alt.trim();
  return text === '' ? '图片' : text;
}

/**
 * The members of a group.
 * @param group - the group state.
 * @param id - the picture being viewed.
 * @returns every entry; the consumer locates `id` within it.
 */
export function groupMembers(group: GroupState, id: string): readonly GroupEntry[] {
  void id;
  return group.entries;
}

/**
 * The picture one step away, or `null` at the end of the group.
 *
 * A lone picture has no neighbour, which is what keeps the `‹ ›` controls off a
 * tool-call attachment.
 * @param group - the group state.
 * @param id - the picture being viewed.
 * @param delta - `+1` for next, `-1` for previous.
 * @returns the neighbour's id, or null when there is none.
 */
export function stepTarget(group: GroupState, id: string, delta: number): string | null {
  if (group.entries.length < 2) return null;
  const index = group.entries.findIndex(entry => entry.id === id);
  if (index < 0) return null;
  return group.entries[index + delta]?.id ?? null;
}
