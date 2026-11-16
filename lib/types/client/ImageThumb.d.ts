import type { ReactNode } from 'react';
/**
 * A stable identity for one picture within its answer.
 *
 * Derived from the caption and the resolved source rather than from a counter, so
 * the same picture keeps its id across re-renders and the group's numbering stays
 * in document order.
 * @param src - the resolved URL.
 * @param caption - the authored path, or a description.
 */
export declare function pictureId(src: string, caption: string): string;
/**
 * The click target around a thumbnail.
 *
 * It hands the picture to the answer's shared viewer, so paging swaps the picture
 * inside one dialog instead of opening a second one on top of the first.
 */
export declare function ImageThumb({ src, alt, caption, label, inline, children }: {
    src: string;
    alt: string;
    caption: string;
    label: string;
    inline?: boolean;
    children: ReactNode;
}): import("react").JSX.Element;
/**
 * A picture that stands alone: a tool-call attachment.
 *
 * It builds its own one-member viewer rather than reaching for a scope, because it
 * has no gallery to page through. The same `ImageLightbox` renders it, so there is
 * only one dialog implementation in the codebase, and the pager reads `1/1` with
 * both arrows disabled 閳?correct for a single picture.
 * @param props - the thumbnail and its labels.
 */
export declare function SoloImage({ src, alt, caption, label, children }: {
    src: string;
    alt: string;
    caption: string;
    label: string;
    children: ReactNode;
}): import("react").JSX.Element;
//# sourceMappingURL=ImageThumb.d.ts.map