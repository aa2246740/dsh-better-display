import type { ReactNode } from 'react';
/** Clamp a scale to the supported range. */
export declare function clampScale(value: number): number;
/** The geometry a drag needs, read from the live elements. */
export interface DragGeometry {
    viewWidth: number;
    viewHeight: number;
    pictureWidth: number;
    pictureHeight: number;
    maxLeft: number;
    maxTop: number;
    restX: number;
    restY: number;
}
/**
 * Where a panned picture comes to rest.
 *
 * Two layers, so the picture never jumps away from the pointer: the scroll offset is
 * clamped to the scrollable range, and whatever the drag asks for beyond that is carried
 * in a free offset. On release the free offset is clamped only far enough to keep a
 * sliver of the picture reachable.
 * @param input - the drag request and the current geometry.
 * @returns the scroll offsets and free offsets to apply.
 */
export declare function settleDrag(input: {
    wantLeft: number;
    wantTop: number;
    freeX: number;
    freeY: number;
    release: boolean;
    geometry: DragGeometry;
}): {
    left: number;
    top: number;
    freeX: number;
    freeY: number;
};
/**
 * The viewer dialog.
 * @param props - the picture, its caption, and the open state.
 */
export declare function ImageLightbox({ open, src, alt, caption, onClose }: {
    open: boolean;
    src: string;
    alt: string;
    caption: string;
    onClose: () => void;
}): ReactNode;
//# sourceMappingURL=ImageLightbox.d.ts.map