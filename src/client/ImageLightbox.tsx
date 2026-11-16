import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useGroupPosition, useOpenViewer, type ImageGroupMember } from './image-group.js';
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
  /** Content coordinate of the anchor, in unscaled pixels. */
  contentX: number;
  contentY: number;
  /** Where the anchor sits inside the viewport, in client pixels. */
  viewX: number;
  viewY: number;
}

/**
 * A click-to-enlarge viewer with wheel zoom, drag panning, real scrollbars and
 * paging through the pictures of one answer.
 *
 * One component serves both image surfaces — tool-call attachments
 * ({@link ImageBlock}) and pictures inside a final answer ({@link MarkdownImage})
 * — so the two cannot drift apart.
 *
 * The stage is a genuine scroll container rather than a transform sandbox: a
 * picture larger than the viewport then has somewhere to go, and the native
 * scrollbars double as a "where am I in this picture" indicator. Dragging is
 * always enabled; a picture that already fits simply has no scroll range.
 * @param props - the thumbnail, its label, and the caption shown in the viewer.
 */
export function ImageLightbox({
  src,
  alt,
  children,
  label,
  caption,
  inline = false
}: {
  /** Already-resolved URL, shared by the thumbnail and the viewer. */
  src: string;
  /** Alternative text; also what the viewer announces. */
  alt: string;
  /** The thumbnail markup; it is wrapped in the trigger button. */
  children: ReactNode;
  /** Accessible name for the trigger, e.g. `放大图片：shot.png`. */
  label: string;
  /** What the viewer's title bar shows: the authored path, or a description. */
  caption: string;
  /** Inline trigger for pictures in the text flow, instead of a filled frame. */
  inline?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  /** Natural pixel size, known once the picture decodes. */
  const [natural, setNatural] = useState<{ width: number; height: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  /** Whether the picture currently overflows the stage; drives the grab cursor. */
  const [pannable, setPannable] = useState(false);
  /** Restored scroll position for the frame after a zoom. */
  const pendingAnchor = useRef<ZoomAnchor | null>(null);
  const dragStart = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const memberId = useId();
  const open = useOpenViewer();
  const member: ImageGroupMember = { id: memberId, src, alt, caption };
  const position = useGroupPosition(member, open.openId, open.setOpenId);

  const reset = useCallback(() => {
    setScale(1);
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

  // Apply the anchor after the new size is laid out but before the frame paints,
  // so the picture does not visibly jump.
  useLayoutEffect(() => {
    const node = stage.current;
    const anchor = pendingAnchor.current;
    if (node === null || anchor === null) return;
    pendingAnchor.current = null;
    node.scrollLeft = anchor.contentX * scale - anchor.viewX;
    node.scrollTop = anchor.contentY * scale - anchor.viewY;
  }, [scale]);

  // Track whether anything is hidden, for the grab cursor. The dialog reports its
  // box only after layout, so this observes the stage instead of assuming a
  // render will re-run the measurement.
  useLayoutEffect(() => {
    const node = stage.current;
    if (node === null) return;
    const measure = () => {
      setPannable(
        node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => {
      observer.disconnect();
    };
  }, [scale, natural, src]);

  // The wheel must not scroll the page behind the dialog, and React's `onWheel`
  // is passive, so this binds directly.
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

  // Closing returns focus to the trigger and forgets the open id, so the next
  // open starts clean.
  useEffect(() => {
    const node = dialog.current;
    if (node === null) return undefined;
    const onClose = () => {
      setScale(1);
      if (stage.current !== null) {
        stage.current.scrollLeft = 0;
        stage.current.scrollTop = 0;
      }
      if (open.openId === memberId) open.setOpenId(null);
      trigger.current?.focus();
    };
    node.addEventListener('close', onClose);
    return () => {
      node.removeEventListener('close', onClose);
    };
  }, [open, memberId]);

  // Paging to this picture opens it, so `‹` / `›` behave like a next-picture
  // button even though the dialog belongs to the picture being replaced.
  useEffect(() => {
    if (open.openId !== memberId) return;
    const node = dialog.current;
    if (node !== null && !node.open) {
      setScale(1);
      node.showModal();
    }
  }, [open.openId, memberId]);

  // Dragging pans the scroll offset. It is unconditional: a picture that fits has
  // no scroll range, so the handler is harmless, and gating on a measurement
  // meant a stale value could silently disable the drag.
  useEffect(() => {
    if (!dragging) return undefined;
    const onMove = (event: PointerEvent) => {
      const start = dragStart.current;
      const node = stage.current;
      if (start === null || node === null) return;
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
    // Arrow keys page through a group, which is what the chevrons do.
    if (position.step !== undefined && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      event.preventDefault();
      position.step(event.key === 'ArrowLeft' ? -1 : 1);
    }
  };

  const showTrigger = () => {
    setScale(1);
    open.setOpenId(memberId);
    const node = dialog.current;
    if (node === null) return;
    // Measure before showing. The picture inside a just-opened modal has not been
    // laid out, so `natural` (which drives both the rendered size and the
    // overflow measurement) can still be null on the first frame — that is what
    // made the first open undraggable until a zoom forced a re-measure. Reading
    // it from the decoded element up front keeps the first frame correct.
    const image = node.querySelector('img');
    if (image !== null && image.complete && image.naturalWidth > 0) {
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    }
    node.showModal();
  };

  // Always a concrete pixel size once the picture is known, so the stage's
  // overflow is deterministic. Before that the img keeps its intrinsic size,
  // which is the same box the browser would pick on its own.
  const width = natural === null ? undefined : Math.round(natural.width * scale);
  const height = natural === null ? undefined : Math.round(natural.height * scale);
  const paging = position.step !== undefined;

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className={inline ? `${css.imageTrigger} ${css.imageTriggerInline}` : css.imageTrigger}
        aria-label={label}
        onClick={showTrigger}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        className={css.imageDialog}
        aria-label="图片预览"
        onKeyDown={onKeyDown}
        onClick={event => {
          if (event.target === dialog.current) dialog.current?.close();
        }}
      >
        <button
          type="button"
          autoFocus
          className={css.dialogClose}
          aria-label="关闭图片预览"
          onClick={() => dialog.current?.close()}
        >
          ×
        </button>
        {/* The title bar carries where the picture came from and where it sits in
            its group, which is the only place a reader can learn either. */}
        <div className={css.lightboxHeader}>
          {paging && (
            <button
              type="button"
              className={css.lightboxButton}
              aria-label="上一张"
              onClick={() => position.step?.(-1)}
            >
              ‹
            </button>
          )}
          <span className={css.lightboxCaption} title={caption} data-reader-image-caption>
            {caption}
          </span>
          {paging && (
            <span className={css.lightboxCounter} data-reader-image-counter>
              {position.index}/{position.total}
            </span>
          )}
          {paging && (
            <button
              type="button"
              className={css.lightboxButton}
              aria-label="下一张"
              onClick={() => position.step?.(1)}
            >
              ›
            </button>
          )}
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
            dragStart.current = {
              x: event.clientX,
              y: event.clientY,
              left: node.scrollLeft,
              top: node.scrollTop
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
          <div className={css.imageStageInner}>
            <img
              src={src}
              alt={alt}
              draggable={false}
              width={width}
              height={height}
              style={
                width === undefined ? undefined : { width: `${width}px`, height: `${height}px` }
              }
              onLoad={event => {
                const node = event.currentTarget;
                setNatural({ width: node.naturalWidth, height: node.naturalHeight });
              }}
            />
          </div>
        </div>
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
    </>
  );
}
