import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
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
export function ImageLightbox({ src, alt, children, label, inline = false }) {
    const dialog = useRef(null);
    const trigger = useRef(null);
    const stage = useRef(null);
    const [scale, setScale] = useState(1);
    const [offset, setOffset] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    // The pointer position that started this drag, in client coordinates.
    const dragStart = useRef(null);
    const reset = useCallback(() => {
        setScale(1);
        setOffset({ x: 0, y: 0 });
    }, []);
    /** Zoom around a point so the pixel under the cursor stays put. */
    const zoomAt = useCallback((next, clientX, clientY) => {
        setScale(current => {
            const target = clampScale(next);
            if (target === current)
                return current;
            const box = stage.current?.getBoundingClientRect();
            if (box === undefined || clientX === undefined || clientY === undefined) {
                return target;
            }
            // Cursor position relative to the stage centre, which is the transform origin.
            const cx = clientX - (box.left + box.width / 2);
            const cy = clientY - (box.top + box.height / 2);
            const ratio = target / current;
            setOffset(prev => ({
                x: cx - (cx - prev.x) * ratio,
                y: cy - (cy - prev.y) * ratio
            }));
            return target;
        });
    }, []);
    // The dialog scrolls the page behind it away unless the wheel is handled
    // non-passively, so this binds directly rather than through React's passive
    // `onWheel`.
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
    // Reset whenever the viewer opens or closes, so a reopened picture starts at
    // 100% instead of wherever the last one was left.
    useEffect(() => {
        const node = dialog.current;
        if (node === null)
            return undefined;
        const onClose = () => {
            reset();
            trigger.current?.focus();
        };
        node.addEventListener('close', onClose);
        return () => {
            node.removeEventListener('close', onClose);
        };
    }, [reset]);
    useEffect(() => {
        if (!dragging)
            return undefined;
        const onMove = (event) => {
            const start = dragStart.current;
            if (start === null)
                return;
            setOffset({
                x: start.ox + (event.clientX - start.x),
                y: start.oy + (event.clientY - start.y)
            });
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
        reset();
        dialog.current?.showModal();
    };
    return (_jsxs(_Fragment, { children: [_jsx("button", { ref: trigger, type: "button", className: inline ? `${css.imageTrigger} ${css.imageTriggerInline}` : css.imageTrigger, "aria-label": label, onClick: open, children: children }), _jsxs("dialog", { ref: dialog, className: css.imageDialog, "aria-label": "\u56FE\u7247\u9884\u89C8", onKeyDown: onKeyDown, onClick: event => {
                    if (event.target === dialog.current)
                        dialog.current?.close();
                }, children: [_jsx("button", { type: "button", autoFocus: true, className: css.dialogClose, "aria-label": "\u5173\u95ED\u56FE\u7247\u9884\u89C8", onClick: () => dialog.current?.close(), children: "\u00D7" }), _jsx("div", { ref: stage, className: css.imageStage, "data-dragging": dragging ? '' : undefined, "data-zoomed": scale > 1 ? '' : undefined, onPointerDown: event => {
                            // Only a zoomed picture can be panned; at 100% it is already centred.
                            if (scale <= 1)
                                return;
                            event.preventDefault();
                            dragStart.current = { x: event.clientX, y: event.clientY, ox: offset.x, oy: offset.y };
                            setDragging(true);
                        }, onDoubleClick: () => {
                            if (scale === 1) {
                                zoomAt(2.5);
                            }
                            else {
                                reset();
                            }
                        }, children: _jsx("img", { src: src, alt: alt, draggable: false, style: { transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` } }) }), _jsxs("div", { className: css.lightboxToolbar, children: [_jsx("button", { type: "button", className: css.lightboxButton, "aria-label": "\u7F29\u5C0F", onClick: () => zoomAt(scale / ZOOM_STEP), children: "\u2212" }), _jsx("output", { className: css.lightboxScale, "aria-live": "polite", "data-reader-image-scale": true, children: percent(scale) }), _jsx("button", { type: "button", className: css.lightboxButton, "aria-label": "\u653E\u5927", onClick: () => zoomAt(scale * ZOOM_STEP), children: "+" }), _jsx("button", { type: "button", className: css.lightboxButton, onClick: reset, title: "\u91CD\u7F6E\u4E3A 100%\uFF08\u6309\u7A7A\u683C\uFF09", children: "100%" })] })] })] }));
}
//# sourceMappingURL=ImageLightbox.js.map