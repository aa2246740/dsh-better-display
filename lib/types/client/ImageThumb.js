import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useImageBand, useSharedViewer } from './image-group.js';
import { ImageLightbox } from './ImageLightbox.js';
import css from './Reader.module.css';
/**
 * A stable identity for one picture within its answer.
 *
 * Derived from the caption and the resolved source rather than from a counter, so
 * the same picture keeps its id across re-renders and the group's numbering stays
 * in document order.
 * @param src - the resolved URL.
 * @param caption - the authored path, or a description.
 */
export function pictureId(src, caption) {
    return `${caption}\n${src}`;
}
/**
 * The click target around a thumbnail.
 *
 * It hands the picture to the answer's shared viewer, so paging swaps the picture
 * inside one dialog instead of opening a second one on top of the first.
 */
export function ImageThumb({ src, alt, caption, label, inline = false, children }) {
    const viewer = useSharedViewer();
    const rank = useImageBand();
    const member = useMemo(() => ({ id: pictureId(src, caption), src, alt, caption, rank }), [src, alt, caption, rank]);
    // Join on mount, not on click. Registering only when a picture is opened made the
    // count depend on click history 閳?four pictures read `1/1`, `1/2`, `1/3`閳?in the
    // order they were opened, instead of `1/4` for all of them.
    const join = viewer?.join;
    useEffect(() => {
        join?.(member);
    }, [join, member]);
    return (_jsx("button", { type: "button", className: inline ? `${css.imageTrigger} ${css.imageTriggerInline}` : css.imageTrigger, "aria-label": label, onClick: () => viewer?.open(member), children: children }));
}
/**
 * A picture that stands alone: a tool-call attachment.
 *
 * It builds its own one-member viewer rather than reaching for a scope, because it
 * has no gallery to page through. The same `ImageLightbox` renders it, so there is
 * only one dialog implementation in the codebase, and the pager reads `1/1` with
 * both arrows disabled 閳?correct for a single picture.
 * @param props - the thumbnail and its labels.
 */
export function SoloImage({ src, alt, caption, label, children }) {
    const [open, setOpen] = useState(false);
    const rank = useImageBand();
    const member = useMemo(() => ({ id: pictureId(src, caption), src, alt, caption, rank }), [src, alt, caption, rank]);
    const close = useCallback(() => setOpen(false), []);
    // A shared scope wins. That is the tool-call case inside a turn: the turn owns one
    // viewer and every picture its tool calls produced joins it, so they page together
    // instead of each opening its own `1/1`.
    const shared = useSharedViewer();
    const join = shared?.join;
    useEffect(() => {
        join?.(member);
    }, [join, member]);
    const viewer = useMemo(() => ({
        open: () => setOpen(true),
        // A lone picture is its own only member, so joining adds nothing.
        join: () => { },
        current: open ? member : null,
        index: 1,
        total: 1,
        // Nothing to page to, so both arrows stay disabled.
        step: () => { },
        close
    }), [open, member, close]);
    // Inside a turn the picture hands itself to that turn's viewer; only a picture
    // with no scope at all opens a private dialog.
    if (shared !== null) {
        return (_jsx("button", { type: "button", className: css.imageTrigger, "aria-label": label, "data-reader-thumb": member.id, onClick: () => shared.open(member), children: children }));
    }
    return (_jsxs(_Fragment, { children: [_jsx("button", { type: "button", className: css.imageTrigger, "aria-label": label, "data-reader-thumb": member.id, onClick: () => setOpen(true), children: children }), open && _jsx(ImageLightbox, { viewer: viewer })] }));
}
//# sourceMappingURL=ImageThumb.js.map