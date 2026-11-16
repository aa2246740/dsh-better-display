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
export declare const IDLE_GROUP: GroupState;
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
export declare function settleDrag(input: {
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
}): {
    left: number;
    top: number;
    freeX: number;
    freeY: number;
};
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
export declare function attachmentLabel(name: string | undefined, mediaType: string | undefined, fallback?: string): string;
/**
 * What a title bar shows for a picture.
 *
 * A tool attachment may carry no file name, and a Markdown picture may carry no
 * destination, so the fallback chain has to end somewhere non-blank.
 * @param destination - the authored path, when there is one.
 * @param alt - alternative text, the next best description.
 * @returns text safe to render in the caption.
 */
export declare function groupCaption(destination: string | undefined, alt: string): string;
/**
 * The members of a group.
 * @param group - the group state.
 * @param id - the picture being viewed.
 * @returns every entry; the consumer locates `id` within it.
 */
export declare function groupMembers(group: GroupState, id: string): readonly GroupEntry[];
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
export declare function stepTarget(group: GroupState, id: string, delta: number): string | null;
//# sourceMappingURL=image-group-order.d.ts.map