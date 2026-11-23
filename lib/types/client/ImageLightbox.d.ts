import type { ReactNode } from 'react';
/** Clamp a scale to the supported range. */
export declare function clampScale(value: number): number;
/** The geometry a drag needs: the stage, the painted picture, and where it rests. */
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
 * The size the picture has at 100%.
 *
 * A picture smaller than the stage keeps its natural pixels. A larger one scales down
 * so 100% shows the whole picture, and the wheel zooms that fitted size.
 * @param naturalWidth - the image's natural width.
 * @param naturalHeight - the image's natural height.
 * @param viewWidth - the stage viewport width.
 * @param viewHeight - the stage viewport height.
 * @returns the fitted width and height, or zeros when the picture itself is unusable.
 */
export declare function fitSize(naturalWidth: number, naturalHeight: number, viewWidth: number, viewHeight: number): {
    width: number;
    height: number;
};
/**
 * Scroll limits and the centred rest offset for one painted size.
 * @param viewWidth - the stage viewport width.
 * @param viewHeight - the stage viewport height.
 * @param pictureWidth - the painted picture width.
 * @param pictureHeight - the painted picture height.
 * @returns the geometry a drag or a zoom consumes.
 */
export declare function buildGeometry(viewWidth: number, viewHeight: number, pictureWidth: number, pictureHeight: number): DragGeometry;
/**
 * Where a panned picture comes to rest.
 *
 * The scroll offset is clamped to the scrollable range, and whatever the drag asks for
 * beyond that is carried in a free offset, so the picture stays under the pointer.
 * On release the free offset is clamped only far enough that a sliver stays reachable.
 * The sliver is a fraction of the smaller of the picture and the viewport, and the
 * current scroll is part of the bound: without it a picture parked at the far edge
 * can be flung entirely off the stage, and a very large picture rejects even `0`.
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
 * The scroll position that keeps one picture point under the pointer across a zoom.
 * @param input - the scales, the pointer in stage coordinates, and the current pan.
 * @returns the scroll and free offsets to apply once the picture has the new size.
 */
export declare function zoomAroundPoint(input: {
    currentScale: number;
    nextScale: number;
    pointerX: number;
    pointerY: number;
    scrollLeft: number;
    scrollTop: number;
    freeX: number;
    freeY: number;
    baseWidth: number;
    baseHeight: number;
    viewWidth: number;
    viewHeight: number;
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