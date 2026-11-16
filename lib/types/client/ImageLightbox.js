import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import css from './Reader.module.css';
/** Zoom limits. Below 1 shows the whole picture; above 1 inspects detail. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
/** Double-click and the zoom buttons step through these. */
const ZOOM_STEP = 1.25;
/** Wheel sensitivity: `exp(-delta * WHEEL_FACTOR)` is linear in the hand. */
const WHEEL_FACTOR = 0.0015;
/** Resetting is a key press away, and the hint says which. */
const RESET_KEYS = new Set(['0', ' ']);
function clampScale(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}
function percent(scale) {
    return `${Math.round(scale * 100)}%`;
}
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
export function ImageLightbox({ src, alt, children, label, inline = false }) {
    const dialog = useRef(null);
    const trigger = useRef(null);
    const stage = useRef(null);
    const [scale, setScale] = useState(1);
    /** Natural pixel size, known once the picture decodes. */
    const [natural, setNatural] = useState(null);
    const [dragging, setDragging] = useState(false);
    /** Whether the picture currently has anything to scroll or drag. */
    const [pannable, setPannable] = useState(false);
    /** Restored scroll position for the frame after a zoom. */
    const pendingAnchor = useRef(null);
    const dragStart = useRef(null);
    const reset = useCallback(() => {
        setScale(1);
    }, []);
    /** Zoom, keeping the point under the cursor where it is. */
    const zoomAt = useCallback((next, clientX, clientY) => {
        const node = stage.current;
        const target = clampScale(next);
        if (target === scale)
            return;
        if (node !== null) {
            const box = node.getBoundingClientRect();
            const viewX = clientX === undefined ? box.width / 2 : clientX - box.left;
            const viewY = clientY === undefined ? box.height / 2 : clientY - box.top;
            pendingAnchor.current = {
                contentX: (node.scrollLeft + viewX) / scale,
                contentY: (node.scrollTop + viewY) / scale,
                viewX,
                viewY
            };
        }
        setScale(target);
    }, [scale]);
    // Apply the anchor after the new size is laid out but before the frame paints,
    // so the picture does not visibly jump.
    useLayoutEffect(() => {
        const node = stage.current;
        const anchor = pendingAnchor.current;
        if (node === null || anchor === null)
            return;
        pendingAnchor.current = null;
        node.scrollLeft = anchor.contentX * scale - anchor.viewX;
        node.scrollTop = anchor.contentY * scale - anchor.viewY;
    }, [scale]);
    // Recompute whether anything is hidden, whenever the size or the zoom changes.
    useLayoutEffect(() => {
        const node = stage.current;
        if (node === null)
            return;
        const overflow = node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1;
        setPannable(overflow);
    }, [scale, natural, dragging]);
    // The wheel must not scroll the page behind the dialog, and React's `onWheel`
    // is passive, so this binds directly.
    useEffect(() => {
        const node = stage.current;
        if (node === null)
            return undefined;
        const onWheel = (event) => {
            event.preventDefault();
            zoomAt(scale * Math.exp(-event.deltaY * WHEEL_FACTOR), event.clientX, event.clientY);
        };
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => {
            node.removeEventListener('wheel', onWheel);
        };
    }, [scale, zoomAt]);
    // Opening and closing both start from a clean 100%, so one picture never
    // inherits the last one's zoom, and closing returns focus to the trigger.
    useEffect(() => {
        const node = dialog.current;
        if (node === null)
            return undefined;
        const onClose = () => {
            setScale(1);
            if (stage.current !== null) {
                stage.current.scrollLeft = 0;
                stage.current.scrollTop = 0;
            }
            trigger.current?.focus();
        };
        node.addEventListener('close', onClose);
        return () => {
            node.removeEventListener('close', onClose);
        };
    }, []);
    // Dragging pans the scroll offset. It is gated on there being something
    // hidden, not on the zoom level: a picture wider or taller than the viewport
    // needs dragging at 100% too.
    useEffect(() => {
        if (!dragging)
            return undefined;
        const onMove = (event) => {
            const start = dragStart.current;
            const node = stage.current;
            if (start === null || node === null)
                return;
            node.scrollLeft = start.left - (event.clientX - start.x);
            node.scrollTop = start.top - (event.clientY - start.y);
        };
        const onUp = () => {
            dragStart.current = null;
            setDragging(false);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
        return () => {
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
    }, [dragging]);
    const onKeyDown = (event) => {
        if (RESET_KEYS.has(event.key)) {
            event.preventDefault();
            reset();
            return;
        }
        // + / - are the keyboard equivalents of the wheel.
        if (event.key === '+' || event.key === '=') {
            event.preventDefault();
            zoomAt(scale * ZOOM_STEP);
        }
        else if (event.key === '-' || event.key === '_') {
            event.preventDefault();
            zoomAt(scale / ZOOM_STEP);
        }
    };
    const open = () => {
        setScale(1);
        dialog.current?.showModal();
    };
    const width = natural === null ? undefined : Math.round(natural.width * scale);
    const height = natural === null ? undefined : Math.round(natural.height * scale);
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: trigger, type: "button", className: inline ? `${css.imageTrigger} ${css.imageTriggerInline}` : css.imageTrigger, "aria-label": label, onClick: open, children: children }), _jsxs("dialog", { ref: dialog, className: css.imageDialog, "aria-label": "\u56FE\u7247\u9884\u89C8", onKeyDown: onKeyDown, onClick: event => {
                    if (event.target === dialog.current)
                        dialog.current?.close();
                }, children: [_jsx("button", { type: "button", autoFocus: true, className: css.dialogClose, "aria-label": "\u5173\u95ED\u56FE\u7247\u9884\u89C8", onClick: () => dialog.current?.close(), children: "\u00D7" }), _jsx("div", { ref: stage, className: css.imageStage, "data-pannable": pannable ? '' : undefined, "data-dragging": dragging ? '' : undefined, onPointerDown: event => {
                            if (!pannable)
                                return;
                            event.preventDefault();
                            const node = stage.current;
                            if (node === null)
                                return;
                            dragStart.current = {
                                x: event.clientX,
                                y: event.clientY,
                                left: node.scrollLeft,
                                top: node.scrollTop
                            };
                            setDragging(true);
                        }, onDoubleClick: () => {
                            if (scale === 1) {
                                zoomAt(2.5);
                            }
                            else {
                                reset();
                            }
                        }, children: _jsx("div", { className: css.imageStageInner, children: _jsx("img", { src: src, alt: alt, draggable: false, width: width, height: height, style: width === undefined ? undefined : { width: `${width}px`, height: `${height}px` }, onLoad: event => {
                                    const node = event.currentTarget;
                                    setNatural({ width: node.naturalWidth, height: node.naturalHeight });
                                } }) }) }), _jsxs("div", { className: css.lightboxToolbar, children: [_jsx("button", { type: "button", className: css.lightboxButton, "aria-label": "\u7F29\u5C0F", onClick: () => zoomAt(scale / ZOOM_STEP), children: "\u2212" }), _jsx("output", { className: css.lightboxScale, "aria-live": "polite", "data-reader-image-scale": true, children: percent(scale) }), _jsx("button", { type: "button", className: css.lightboxButton, "aria-label": "\u653E\u5927", onClick: () => zoomAt(scale * ZOOM_STEP), children: "+" }), _jsx("button", { type: "button", className: css.lightboxButton, onClick: reset, title: "\u91CD\u7F6E\u4E3A 100%\uFF08\u6309\u7A7A\u683C\uFF09", children: "100%" })] })] })] }));
}
//# sourceMappingURL=ImageLightbox.js.map