import type { ReactNode } from 'react';
/**
 * A click-to-enlarge viewer with wheel zoom and drag panning.
 *
 * One component serves both image surfaces — tool-call attachments
 * ({@link ImageBlock}) and pictures inside a final answer ({@link MarkdownImage})
 * — so the two cannot drift apart.
 *
 * The picture is scaled with a CSS transform rather than a width change: a
 * `max-width: 82vw` box inside a dialog cannot grow past its cap, and a transform
 * also avoids re-laying-out the dialog on every wheel tick. The stage clips the
 * overflow, so a zoomed picture never spills onto the backdrop.
 * @param props - the thumbnail to show in the page, plus what the viewer labels.
 */
export declare function ImageLightbox({ src, alt, children, label, inline }: {
    /** Already-resolved URL, shared by the thumbnail and the viewer. */
    src: string;
    /** Alternative text; also what the viewer announces. */
    alt: string;
    /** The thumbnail markup; it is wrapped in the trigger button. */
    children: ReactNode;
    /** Accessible name for the trigger, e.g. `放大图片：shot.png`. */
    label: string;
    /** Inline trigger for pictures in the text flow, instead of a filled frame. */
    inline?: boolean;
}): import("react").JSX.Element;
//# sourceMappingURL=ImageLightbox.d.ts.map