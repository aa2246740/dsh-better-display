import type { ReactNode } from 'react';
/**
 * One group of pictures with a single shared viewer.
 *
 * The grouping rule is not a fixed tree: it depends on where the reader opened the
 * viewer from. A picture clicked in a tool call sees every picture of the turn; a
 * picture clicked in the final answer sees only the answer's pictures. A static
 * nesting cannot express that 鈥?the outer group would always win 鈥?so groups are
 * declared here with a `rank`, and the picture that opens the viewer picks which
 * band it contributes.
 *
 * @module
 */
/** One registered picture. */
export interface ImageGroupMember {
    /** Stable registration key. */
    id: string;
    /** The enlarged URL. */
    src: string;
    /** Alternative text for the viewer. */
    alt: string;
    /** What the caption shows: the authored path, or a description for a blob. */
    caption: string;
    /** Which band the picture belongs to; lower is wider. */
    rank: number;
    /**
     * The picture's position in the document, assigned by the scope.
     *
     * Absent on what a thumbnail hands over: only the scope knows document order, and it
     * derives that from the DOM because a folded block renders no thumbnails at all.
     */
    seq?: number;
}
/** What a thumbnail hands to the scope; `seq` is assigned by the scope itself. */
export type ImageThumbMember = Omit<ImageGroupMember, 'seq'>;
/** What a thumbnail needs in order to open the shared viewer. */
export interface SharedViewer {
    /** Show this picture, expanding the group to the band it belongs to. */
    open: (member: ImageThumbMember) => void;
    /** Record a picture as a member without showing it; called on mount. */
    join: (member: ImageThumbMember) => void;
    /** The picture currently on screen, or null when the viewer is closed. */
    current: ImageGroupMember | null;
    /** 1-based position of `current` within the visible band. */
    index: number;
    /** Size of the visible band. */
    total: number;
    /** Move by `+1` / `-1`; a no-op at either end. */
    step: (delta: number) => void;
    /** Close the viewer. */
    close: () => void;
}
/** Bands, widest first. A turn's tool pictures are `TOOL`; an answer's are `ANSWER`. */
export declare const TOOL_BAND = 0;
/** Pictures inside one final answer. */
export declare const ANSWER_BAND = 1;
/**
 * Declare the band for the pictures beneath this point.
 * @param props - the band and the children.
 */
export declare function ImageBand({ rank, children }: {
    rank: number;
    children: ReactNode;
}): import("react").JSX.Element;
/** The band a picture sits in, from the nearest {@link ImageBand}. */
export declare function useImageBand(): number;
/**
 * Provide one shared viewer for every picture beneath it.
 *
 * A picture opened at band `N` pages through every member whose rank is `<= N`, so
 * the viewer expands exactly as far as the entry point deserves: opening from a tool
 * call shows the turn's tool pictures *and* the answer's, while opening from the
 * answer shows only the answer's.
 * @param props - the pictures, and the renderer for the single viewer.
 */
export declare function ImageViewerScope({ children, render }: {
    children: ReactNode;
    render: (viewer: SharedViewer) => ReactNode;
}): import("react").JSX.Element;
/**
 * The shared viewer, or null where no scope is present.
 *
 * Null means the picture manages its own dialog: nothing above it declared a group,
 * so there is nothing to page through.
 */
export declare function useSharedViewer(): SharedViewer | null;
//# sourceMappingURL=image-group.d.ts.map