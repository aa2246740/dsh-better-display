import type { SharedViewer } from './image-group.js';
/**
 * The one image viewer for a group of pictures.
 *
 * Rendered by `ImageViewerScope`, never by a thumbnail: paging has to swap the
 * picture inside a single `<dialog>`, and a dialog belongs to a component that is
 * not one of the pictures being paged. That is the bug this replaces — each picture
 * owned a dialog, so `›` opened a second one on top instead of replacing the first,
 * and there was no way back.
 *
 * The stage is a genuine scroll container rather than a transform sandbox: a
 * picture larger than the viewport then has somewhere to go, and the native
 * scrollbars double as a "where am I" indicator.
 * @param props - the shared viewer state; the picture comes from `viewer.current`.
 */
export declare function ImageLightbox({ viewer }: {
    viewer: SharedViewer;
}): import("react").JSX.Element;
//# sourceMappingURL=ImageLightbox.d.ts.map