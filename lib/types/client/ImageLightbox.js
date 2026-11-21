import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * A full-screen picture viewer: zoom, pan, and reset.
 *
 * The Host's own preview dialog shows the picture at fit-width and nothing more. A
 * screenshot of a dense UI needs reading at 100% or beyond, so this keeps the dialog
 * and adds the interactions that make that possible:
 *
 *  - the wheel zooms about the pointer, never scrolling the page behind it;
 *  - dragging pans at any scale and keeps the picture where it was put;
 *  - space or `0` returns to 100%, centred.
 *
 * The dialog is the native `<dialog>` element, so the browser owns Escape, the top
 * layer and the focus trap.
 *
 * @module
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import css from './Reader.module.css';
/** Smallest and largest scale the wheel can reach. */
const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
/** How much of the picture must stay on screen after a drag, as a fraction. */
const KEEP_VISIBLE = 0.15;
/** Clamp a scale to the supported range. */
export function clampScale(value) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
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
export function settleDrag(input) {
    const { geometry } = input;
    const left = Math.min(geometry.maxLeft, Math.max(0, input.wantLeft));
    const top = Math.min(geometry.maxTop, Math.max(0, input.wantTop));
    // Whatever the clamped scroll could not follow becomes the free offset.
    let freeX = input.freeX + (left - input.wantLeft);
    let freeY = input.freeY + (top - input.wantTop);
    if (input.release) {
        // A sliver of the picture stays reachable, measured from where it rests.
        const minFreeX = KEEP_VISIBLE * geometry.pictureWidth - geometry.pictureWidth - geometry.restX;
        const maxFreeX = geometry.viewWidth - KEEP_VISIBLE * geometry.pictureWidth - geometry.restX;
        const minFreeY = KEEP_VISIBLE * geometry.pictureHeight - geometry.pictureHeight - geometry.restY;
        const maxFreeY = geometry.viewHeight - KEEP_VISIBLE * geometry.pictureHeight - geometry.restY;
        freeX = Math.min(maxFreeX, Math.max(minFreeX, freeX));
        freeY = Math.min(maxFreeY, Math.max(minFreeY, freeY));
    }
    return { left, top, freeX, freeY };
}
/**
 * The viewer dialog.
 * @param props - the picture, its caption, and the open state.
 */
export function ImageLightbox({ open, src, alt, caption, onClose }) {
    const dialog = useRef(null);
    const stage = useRef(null);
    const inner = useRef(null);
    const [scale, setScale] = useState(1);
    const [natural, setNatural] = useState(null);
    const [free, setFree] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [copied, setCopied] = useState(false);
    const drag = useRef(null);
    /** Swallow the click that ends a drag, so it cannot reach the backdrop. */
    const dragged = useRef(false);
    // Open and close through the element, so Escape keeps working.
    useEffect(() => {
        const node = dialog.current;
        if (node === null)
            return;
        if (open && !node.open)
            node.showModal();
        if (!open && node.open)
            node.close();
    }, [open]);
    // A new picture starts at 100%, centred.
    useEffect(() => {
        setScale(1);
        setNatural(null);
        setFree({ x: 0, y: 0 });
        setCopied(false);
    }, [src]);
    const readGeometry = useCallback(() => {
        const view = stage.current;
        const picture = inner.current;
        if (view === null || picture === null)
            return null;
        // `getBoundingClientRect`, not `offsetWidth`: a transform scales what is painted but
        // leaves the layout box alone, so `offsetWidth` reports the unzoomed size and the
        // drag limits would ignore the zoom entirely.
        const box = picture.getBoundingClientRect();
        const pictureWidth = box.width;
        const pictureHeight = box.height;
        return {
            viewWidth: view.clientWidth,
            viewHeight: view.clientHeight,
            pictureWidth,
            pictureHeight,
            maxLeft: Math.max(0, pictureWidth - view.clientWidth),
            maxTop: Math.max(0, pictureHeight - view.clientHeight),
            restX: Math.max(0, (view.clientWidth - pictureWidth) / 2),
            restY: Math.max(0, (view.clientHeight - pictureHeight) / 2)
        };
    }, []);
    const centre = useCallback(() => {
        const node = stage.current;
        const geometry = readGeometry();
        if (node === null || geometry === null)
            return;
        node.scrollLeft = Math.max(0, (geometry.pictureWidth - node.clientWidth) / 2);
        node.scrollTop = Math.max(0, (geometry.pictureHeight - node.clientHeight) / 2);
    }, [readGeometry]);
    const reset = useCallback(() => {
        setScale(1);
        setFree({ x: 0, y: 0 });
        const node = stage.current;
        if (node !== null) {
            node.scrollLeft = 0;
            node.scrollTop = 0;
        }
    }, []);
    // The wheel zooms about the pointer; the page behind it must not scroll.
    useEffect(() => {
        const node = stage.current;
        if (node === null || !open)
            return;
        const onWheel = (event) => {
            event.preventDefault();
            const rect = node.getBoundingClientRect();
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            setScale(current => {
                const next = clampScale(current * (event.deltaY < 0 ? 1.12 : 1 / 1.12));
                if (next === current)
                    return current;
                const ratio = next / current;
                // Keep the point under the pointer still across the resize.
                node.scrollLeft = (node.scrollLeft + pointerX) * ratio - pointerX;
                node.scrollTop = (node.scrollTop + pointerY) * ratio - pointerY;
                return next;
            });
        };
        node.addEventListener('wheel', onWheel, { passive: false });
        return () => node.removeEventListener('wheel', onWheel);
    }, [open]);
    // Space and `0` reset, so a zoomed picture is one key from readable again.
    useEffect(() => {
        if (!open)
            return;
        const onKey = (event) => {
            if (event.key !== ' ' && event.key !== '0')
                return;
            event.preventDefault();
            reset();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, reset]);
    // Re-centre after a scale change, so a zoom-in lands on the middle of the picture.
    useLayoutEffect(() => {
        centre();
    }, [scale, natural, centre]);
    const onPointerDown = (event) => {
        if (event.button !== 0)
            return;
        const node = stage.current;
        if (node === null)
            return;
        dragged.current = false;
        setDragging(true);
        drag.current = {
            x: event.clientX,
            y: event.clientY,
            freeX: free.x,
            freeY: free.y,
            moved: false
        };
        node.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event) => {
        const state = drag.current;
        const node = stage.current;
        if (state === null || node === null)
            return;
        const dx = event.clientX - state.x;
        const dy = event.clientY - state.y;
        if (!state.moved && Math.abs(dx) + Math.abs(dy) > 2) {
            state.moved = true;
            dragged.current = true;
        }
        if (!state.moved)
            return;
        const geometry = readGeometry();
        if (geometry === null)
            return;
        const settled = settleDrag({
            wantLeft: node.scrollLeft - dx,
            wantTop: node.scrollTop - dy,
            freeX: state.freeX,
            freeY: state.freeY,
            release: false,
            geometry
        });
        node.scrollLeft = settled.left;
        node.scrollTop = settled.top;
        setFree({ x: settled.freeX, y: settled.freeY });
    };
    const onPointerUp = (event) => {
        const state = drag.current;
        const node = stage.current;
        drag.current = null;
        setDragging(false);
        if (state === null || node === null)
            return;
        node.releasePointerCapture(event.pointerId);
        if (!state.moved)
            return;
        const geometry = readGeometry();
        if (geometry === null)
            return;
        // Keep the picture where it was put: clamp only far enough to stay reachable.
        const settled = settleDrag({
            wantLeft: node.scrollLeft,
            wantTop: node.scrollTop,
            freeX: free.x,
            freeY: free.y,
            release: true,
            geometry
        });
        setFree({ x: settled.freeX, y: settled.freeY });
    };
    return (_jsxs("dialog", { ref: dialog, className: css.imageDialog, "aria-label": "\u56FE\u7247\u9884\u89C8", onClose: onClose, onClick: event => {
            // A click that ends a drag must not close the dialog.
            if (dragged.current) {
                dragged.current = false;
                return;
            }
            if (event.target === dialog.current)
                onClose();
        }, children: [_jsxs("div", { className: css.lightboxHeader, children: [_jsx("button", { type: "button", className: css.lightboxCaption, title: `${caption}\n双击复制路径`, "data-reader-image-caption": true, "data-copied": copied || undefined, onDoubleClick: () => {
                            void navigator.clipboard?.writeText(caption);
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1200);
                        }, children: copied ? '已复制' : caption }), _jsx("div", { className: css.lightboxToolbar, children: _jsxs("button", { type: "button", className: css.lightboxButton, onClick: reset, title: "\u91CD\u7F6E\u4E3A 100%\uFF08\u6309\u7A7A\u683C\uFF09", children: [Math.round(scale * 100), "%"] }) })] }), _jsx("button", { type: "button", autoFocus: true, className: css.dialogClose, "aria-label": "\u5173\u95ED\u56FE\u7247\u9884\u89C8", onClick: onClose, children: "\u00D7" }), _jsx("div", { ref: stage, className: css.imageStage, "data-zoomed": scale !== 1 || undefined, "data-dragging": dragging || undefined, onPointerDown: onPointerDown, onPointerMove: onPointerMove, onPointerUp: onPointerUp, onPointerCancel: onPointerUp, children: _jsx("div", { ref: inner, className: css.imageStageInner, style: { transform: `translate(${free.x}px, ${free.y}px)` }, children: _jsx("img", { src: src, alt: alt, style: { width: natural === null ? undefined : natural.width * scale }, draggable: false, onLoad: event => {
                            const image = event.currentTarget;
                            setNatural({ width: image.naturalWidth, height: image.naturalHeight });
                        } }) }) })] }));
}
//# sourceMappingURL=ImageLightbox.js.map