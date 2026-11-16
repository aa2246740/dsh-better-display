import type { ReactNode } from 'react';
/**
 * A click-to-enlarge viewer with wheel zoom, drag panning and real scrollbars.
 *
 * One component serves both image surfaces — tool-call attachments
 * ({@link ImageBlock}) and pictures inside a final answer ({@link MarkdownImage})
 * — so the two cannot drift apart.
 *
 * The stage genuinely scrolls rather than faking pan with a transform. That
 * matters for pictures that are larger than the viewport even at 100%: with a
 * transform there is nothing to reveal the hidden part, and no way to tell where
 * in the picture the reader currently is. Native overflow gives both — the
 * scrollbars are the position indicator, and dragging moves the scroll offset.
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