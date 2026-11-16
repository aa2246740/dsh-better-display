import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { SharedViewer } from './image-group.js';
import { settleDrag } from './image-group-order.js';
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

function clampScale(value: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

function percent(scale: number): string {
  return `${Math.round(scale * 100)}%`;
}

/** The cursor point that must stay under the pointer across a zoom step. */
interface ZoomAnchor {
  contentX: number;
  contentY: number;
  viewX: number;
  viewY: number;
}

/**
 * The one image viewer for a group of pictures.
 *
 * Rendered by `ImageViewerScope`, never by a thumbnail: paging has to swap the
 * picture inside a single `<dialog>`, and a dialog belongs to a component that is
 * not one of the pictures being paged. That is the bug this replaces — each picture
 * owned a dialog, so `›` opened a second one on top instead of replacing the first,
 * and there was no way back.
 *
 * The stage is a genuine scroll container rather than a transform sandbox: a
 * picture larger than the viewport then has somewhere to go, and the native
 * scrollbars double as a "where am I" indicator.
 * @param props - the shared viewer state; the picture comes from `viewer.current`.
 */
export function ImageLightbox({ viewer }: { viewer: SharedViewer }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  /** Natural pixel size, known once the picture decodes. */
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** True for a moment after the caption is double-clicked, to confirm the copy. */
  const [copied, setCopied] = useState(false);
  /** Whether the picture currently overflows the stage; drives the minimap. */
  const [pannable, setPannable] = useState(false);
  /**
   * Free displacement in client pixels, applied on top of the scroll position.
   *
   * `scrollLeft`/`scrollTop` are clamped to the scrollable range, so they cannot
   * push a picture past its own edge. A second unclamped layer carries the part the
   * range cannot express, so a picture smaller than the stage can be moved too.
   */
  const [free, setFree] = useState({ x: 0, y: 0 });
  /**
   * Mirror of `free` for the pointer handlers.
   *
   * They are bound to `window` once per gesture, so the closures they capture are
   * the ones from the frame the drag started in; reading `free` there would use a
   * stale value and undo most of the movement on release.
   */
  const freeRef = useRef({ x: 0, y: 0 });
  /** Stage and picture boxes for the minimap, in one shared canvas. */
  const [viewBox, setViewBox] = useState({
    view: { left: 0, top: 0, width: 1, height: 1 },
    picture: { left: 0, top: 0, width: 1, height: 1 }
  });
  const pendingAnchor = useRef<ZoomAnchor | null>(null);
  const dragStart = useRef<{
    x: number;
    y: number;
    left: number;
    top: number;
    freeX: number;
    freeY: number;
  } | null>(null);
  /** Set when a pointer gesture actually moved the picture, so its click is ignored. */
  const draggedRef = useRef(false);

  const current = viewer.current;
  const src = current?.src ?? '';
  const alt = current?.alt ?? '';
  const caption = current?.caption ?? '';
  const paging = viewer.total > 1;

  /** Reset to 100%, centred. Space does this. */
  const reset = useCallback(() => {
    setScale(1);
    freeRef.current = { x: 0, y: 0 };
    setFree(freeRef.current);
    const node = stage.current;
    if (node !== null) {
      node.scrollLeft = 0;
      node.scrollTop = 0;
    }
  }, []);

  /** Zoom, keeping the point under the cursor where it is. */
  const zoomAt = useCallback(
    (next: number, clientX?: number, clientY?: number) => {
      const node = stage.current;
      const target = clampScale(next);
      if (target === scale) return;
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
    },
    [scale]
  );

  // A new picture starts from a clean state: 100%, centred, nothing dragged.
  useEffect(() => {
    setScale(1);
    setNatural(null);
    freeRef.current = { x: 0, y: 0 };
    setFree(freeRef.current);
    if (stage.current !== null) {
      stage.current.scrollLeft = 0;
      stage.current.scrollTop = 0;
    }
  }, [src]);

  // Open while a picture is selected, closed otherwise. Closing from outside (the
  // backdrop, Esc, the × button) clears the selection so state cannot disagree
  // with the DOM.
  useEffect(() => {
    const node = dialog.current;
    if (node === null) return;
    if (current !== null && !node.open) node.showModal();
    if (current === null && node.open) node.close();
  }, [current]);

  useEffect(() => {
    const node = dialog.current;
    if (node === null) return undefined;
    const onClose = () => {
      if (viewer.current !== null) viewer.close();
    };
    node.addEventListener('close', onClose);
    return () => {
      node.removeEventListener('close', onClose);
    };
  }, [viewer]);

  // Apply the zoom anchor after layout but before paint, so nothing jumps.
  useLayoutEffect(() => {
    const node = stage.current;
    const anchor = pendingAnchor.current;
    if (node === null || anchor === null) return;
    pendingAnchor.current = null;
    node.scrollLeft = anchor.contentX * scale - anchor.viewX;
    node.scrollTop = anchor.contentY * scale - anchor.viewY;
  }, [scale]);

  // Track the picture and viewport boxes for the minimap, in one canvas, so it can
  // show a picture half out of the window as actually half out.
  useLayoutEffect(() => {
    const node = stage.current;
    if (node === null) return;
    const measure = () => {
      const viewWidth = node.clientWidth;
      const viewHeight = node.clientHeight;
      const pictureWidth = natural === null ? viewWidth : natural.width * scale;
      const pictureHeight = natural === null ? viewHeight : natural.height * scale;
      const pictureLeft = -node.scrollLeft + free.x;
      const pictureTop = -node.scrollTop + free.y;
      const minX = Math.min(0, pictureLeft);
      const minY = Math.min(0, pictureTop);
      const maxX = Math.max(viewWidth, pictureLeft + pictureWidth);
      const maxY = Math.max(viewHeight, pictureTop + pictureHeight);
      const spanX = maxX - minX || 1;
      const spanY = maxY - minY || 1;
      setViewBox({
        view: {
          left: (0 - minX) / spanX,
          top: (0 - minY) / spanY,
          width: viewWidth / spanX,
          height: viewHeight / spanY
        },
        picture: {
          left: (pictureLeft - minX) / spanX,
          top: (pictureTop - minY) / spanY,
          width: pictureWidth / spanX,
          height: pictureHeight / spanY
        }
      });
      setPannable(
        node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    node.addEventListener('scroll', measure, { passive: true });
    return () => {
      observer.disconnect();
      node.removeEventListener('scroll', measure);
    };
  }, [scale, natural, src, free]);

  // The wheel must not scroll the page behind the dialog, and React's `onWheel` is
  // passive, so this binds directly.
  useEffect(() => {
    const node = stage.current;
    if (node === null) return undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomAt(scale * Math.exp(-event.deltaY * WHEEL_FACTOR), event.clientX, event.clientY);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      node.removeEventListener('wheel', onWheel);
    };
  }, [scale, zoomAt]);

  // Dragging pans two layers. Releasing keeps the picture where it was put and only
  // pulls it back enough that a sliver stays visible.
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event: PointerEvent) => {
      const start = dragStart.current;
      const node = stage.current;
      if (start === null || node === null) return;
      if (Math.abs(event.clientX - start.x) + Math.abs(event.clientY - start.y) > 2) {
        draggedRef.current = true;
      }
      const settled = settleDrag({
        wantLeft: start.left - (event.clientX - start.x),
        wantTop: start.top - (event.clientY - start.y),
        maxLeft: node.scrollWidth - node.clientWidth,
        maxTop: node.scrollHeight - node.clientHeight,
        freeX: start.freeX,
        freeY: start.freeY,
        release: false
      });
      node.scrollLeft = settled.left;
      node.scrollTop = settled.top;
      freeRef.current = { x: settled.freeX, y: settled.freeY };
      setFree(freeRef.current);
    };
    const onUp = () => {
      const node = stage.current;
      dragStart.current = null;
      setDragging(false);
      if (node === null) return;
      const pictureWidth = natural === null ? node.clientWidth : natural.width * scale;
      const pictureHeight = natural === null ? node.clientHeight : natural.height * scale;
      const settled = settleDrag({
        wantLeft: node.scrollLeft,
        wantTop: node.scrollTop,
        maxLeft: node.scrollWidth - node.clientWidth,
        maxTop: node.scrollHeight - node.clientHeight,
        freeX: freeRef.current.x,
        freeY: freeRef.current.y,
        release: true,
        visibleFraction: 0.15,
        viewWidth: node.clientWidth,
        viewHeight: node.clientHeight,
        pictureWidth,
        pictureHeight,
        restX: (node.clientWidth - pictureWidth) / 2,
        restY: (node.clientHeight - pictureHeight) / 2
      });
      node.scrollLeft = settled.left;
      node.scrollTop = settled.top;
      freeRef.current = { x: settled.freeX, y: settled.freeY };
      setFree(freeRef.current);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [dragging, natural, scale]);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (RESET_KEYS.has(event.key)) {
      event.preventDefault();
      reset();
      return;
    }
    if (event.key === '+' || event.key === '=') {
      event.preventDefault();
      zoomAt(scale * ZOOM_STEP);
      return;
    }
    if (event.key === '-' || event.key === '_') {
      event.preventDefault();
      zoomAt(scale / ZOOM_STEP);
      return;
    }
    if (viewer.total > 1 && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      viewer.step(event.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  const width = natural === null ? undefined : Math.round(natural.width * scale);
  const height = natural === null ? undefined : Math.round(natural.height * scale);

  return (
    <dialog
      ref={dialog}
      className={css.imageDialog}
      aria-label="图片预览"
      onKeyDown={onKeyDown}
      onClick={event => {
        // A drag that ends over the backdrop still fires a click on the dialog; that
        // click must not close the viewer.
        if (draggedRef.current) {
          draggedRef.current = false;
          return;
        }
        if (event.target === dialog.current) viewer.close();
      }}
    >
      <button
        type="button"
        autoFocus
        className={css.dialogClose}
        aria-label="关闭图片预览"
        onClick={() => viewer.close()}
      >
        ×
      </button>
      {/* Two rows: the full path centred, then the pager below it. Sharing a row
          makes a long path and the controls fight for the same space. The pager is
          always present, so `1/1` still shows with both arrows disabled. */}
      <div className={css.lightboxHeader}>
        <span
          className={css.lightboxCaption}
          title={`${caption}\n双击复制路径`}
          data-reader-image-caption
          data-copied={copied ? '' : undefined}
          onDoubleClick={() => {
            void navigator.clipboard?.writeText(caption);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? '已复制' : caption}
        </span>
        <div className={css.lightboxPager} data-reader-image-pager>
          <button
            type="button"
            className={css.lightboxNav}
            aria-label="上一张"
            disabled={!paging || viewer.index <= 1}
            onClick={() => viewer.step(-1)}
          >
            ‹
          </button>
          <span className={css.lightboxCounter} data-reader-image-counter>
            {viewer.index}/{viewer.total}
          </span>
          <button
            type="button"
            className={css.lightboxNav}
            aria-label="下一张"
            disabled={!paging || viewer.index >= viewer.total}
            onClick={() => viewer.step(1)}
          >
            ›
          </button>
        </div>
      </div>
      <div
        ref={stage}
        className={css.imageStage}
        data-pannable={pannable ? '' : undefined}
        data-dragging={dragging ? '' : undefined}
        onPointerDown={event => {
          const node = stage.current;
          if (node === null) return;
          event.preventDefault();
          draggedRef.current = false;
          dragStart.current = {
            x: event.clientX,
            y: event.clientY,
            left: node.scrollLeft,
            top: node.scrollTop,
            freeX: freeRef.current.x,
            freeY: freeRef.current.y
          };
          setDragging(true);
        }}
        onDoubleClick={() => {
          if (scale === 1) {
            zoomAt(2.5);
          } else {
            reset();
          }
        }}
      >
        <div
          className={css.imageStageInner}
          style={
            free.x === 0 && free.y === 0
              ? undefined
              : { transform: `translate(${free.x}px, ${free.y}px)` }
          }
        >
          <img
            src={src}
            alt={alt}
            draggable={false}
            width={width}
            height={height}
            style={width === undefined ? undefined : { width: `${width}px`, height: `${height}px` }}
            onLoad={event => {
              const node = event.currentTarget;
              setNatural({ width: node.naturalWidth, height: node.naturalHeight });
            }}
          />
        </div>
      </div>
      {/* Only while dragging: an always-on overlay would cover the very part of the
          picture being examined. The thumbnail is placed and sized like the picture
          itself, so the two boxes show their real relationship. */}
      {dragging && (
        <div className={css.lightboxMinimap} aria-hidden="true">
          <img
            src={src}
            alt=""
            data-reader-image-minimap
            style={{
              position: 'absolute',
              left: `${viewBox.picture.left * 100}%`,
              top: `${viewBox.picture.top * 100}%`,
              width: `${viewBox.picture.width * 100}%`,
              height: `${viewBox.picture.height * 100}%`,
              objectFit: 'fill',
              opacity: 0.55
            }}
          />
          <div
            className={css.lightboxViewBox}
            data-reader-image-viewbox
            style={{
              left: `${viewBox.view.left * 100}%`,
              top: `${viewBox.view.top * 100}%`,
              width: `${viewBox.view.width * 100}%`,
              height: `${viewBox.view.height * 100}%`
            }}
          />
        </div>
      )}
      <div className={css.lightboxToolbar}>
        <button
          type="button"
          className={css.lightboxButton}
          aria-label="缩小"
          onClick={() => zoomAt(scale / ZOOM_STEP)}
        >
          −
        </button>
        <output className={css.lightboxScale} aria-live="polite" data-reader-image-scale>
          {percent(scale)}
        </output>
        <button
          type="button"
          className={css.lightboxButton}
          aria-label="放大"
          onClick={() => zoomAt(scale * ZOOM_STEP)}
        >
          +
        </button>
        <button
          type="button"
          className={css.lightboxButton}
          onClick={reset}
          title="重置为 100%（按空格）"
        >
          100%
        </button>
      </div>
    </dialog>
  );
}
