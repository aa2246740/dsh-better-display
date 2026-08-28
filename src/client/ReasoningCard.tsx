import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { REASON_HOLD, REASON_STEP, reasoningTarget } from './reasoning-follow.js';
import css from './Reader.module.css';

const EASING = 'cubic-bezier(.22,1,.36,1)';

/** One real transcript: reference transform while following, native scroll while reading. */
export function ReasoningCard({ children, step, active, motion, selected, onRead }: {
  children: ReactNode; step: number; active: boolean; motion: boolean; selected: boolean; onRead: () => void;
}) {
  const viewport = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const controls = useId();
  const [expanded, setExpanded] = useState(false);
  const [following, setFollowing] = useState(true);
  const [overflow, setOverflow] = useState(false);
  const [edges, setEdges] = useState('none');
  const lastHeight = useRef(0);
  const resize = useRef<Animation | null>(null);
  const previousExpanded = useRef(expanded);
  const stopFollow = useRef<() => void>(() => {});
  const allowed = following && active && motion && !selected;

  const pause = useCallback(() => {
    stopFollow.current();
    setFollowing(false);
    onRead();
  }, [onRead]);

  useLayoutEffect(() => {
    // The parent's selection observer can suspend this card before its own
    // listener runs. Clearing a selection must not silently resume following.
    if (!selected) return;
    stopFollow.current();
    setFollowing(false);
  }, [selected]);

  useLayoutEffect(() => {
    const port = viewport.current;
    const host = port?.closest<HTMLElement>('[data-conversation-scroll]');
    if (!port || !host) return;
    const fit = () => {
      // Public DSH layout variable, updated by the native composer's observer.
      // Leave room for the permanent identity, footer and reading margin.
      const composer = parseFloat(getComputedStyle(host).getPropertyValue('--dsh-composer-height')) || 152;
      const heading = port.parentElement?.querySelector<HTMLElement>('[data-reader-reasoning-heading]')?.offsetHeight || 30;
      const footer = port.parentElement?.querySelector<HTMLElement>('[data-ud-check=reasoning-controls]')?.offsetHeight || 38;
      const available = Math.max(120, host.clientHeight - composer - heading - footer - 32);
      port.style.setProperty('--reason-reading-height', `${available}px`);
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(host);
    const attributes = new MutationObserver(fit);
    attributes.observe(host, { attributes: true, attributeFilter: ['style'] });
    return () => { observer.disconnect(); attributes.disconnect(); };
  }, [expanded]);

  useLayoutEffect(() => {
    const port = viewport.current;
    const text = content.current;
    const scrollTrack = track.current;
    if (!port || !text || !scrollTrack) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextAt = performance.now() + REASON_HOLD;
    let alive = true;
    let automatic = false;
    let lastPainted = port.scrollTop;
    let targetOffset = lastPainted;
    const tail = () => Math.max(0, text.offsetHeight - port.clientHeight);
    const clamp = (value: number) => Math.max(0, Math.min(tail(), value));
    const paintedOffset = () => {
      if (!automatic) return port.scrollTop;
      const transform = getComputedStyle(scrollTrack).transform;
      // Reduced-motion CSS may win before React receives the media change.
      // Retain the last painted position rather than snapping back to the top.
      return clamp(transform === 'none' ? lastPainted : port.scrollTop - new DOMMatrixReadOnly(transform).m42);
    };
    const hasSelection = () => {
      const selection = document.getSelection();
      return !!selection && !selection.isCollapsed && !!selection.anchorNode && text.contains(selection.anchorNode);
    };
    const cancel = () => {
      cancelAnimationFrame(frame); frame = 0;
      clearTimeout(timer); timer = undefined;
      delete port.dataset.reasoningMoving;
    };
    const manual = () => {
      if (!automatic) return;
      const top = paintedOffset();
      automatic = false;
      scrollTrack.style.transition = 'none';
      scrollTrack.style.transform = 'none';
      // Set both in the same layout effect/event, before a frame can paint.
      // The first wheel gesture must already have a native scrollable viewport.
      port.style.overflow = 'auto';
      port.scrollTop = top;
      lastPainted = port.scrollTop;
      port.dataset.reasoningMode = 'manual';
    };
    const follow = () => {
      if (automatic) return;
      targetOffset = lastPainted = clamp(port.scrollTop);
      scrollTrack.style.transition = 'none';
      scrollTrack.style.transform = `translateY(-${lastPainted}px)`;
      port.scrollTop = 0;
      port.style.overflow = 'hidden';
      automatic = true;
      port.dataset.reasoningMode = 'transform';
    };
    const measure = (recordHeight = true) => {
      const previewHeight = parseFloat(getComputedStyle(port).getPropertyValue('--reason-preview-height'));
      setOverflow(text.offsetHeight > previewHeight + 1);
      lastPainted = paintedOffset();
      const top = lastPainted > 1;
      const bottom = tail() - lastPainted > 1;
      const next = top ? bottom ? 'both' : 'top' : bottom ? 'bottom' : 'none';
      setEdges(value => value === next ? value : next);
      if (recordHeight && !resize.current) lastHeight.current = port.clientHeight;
    };
    stopFollow.current = () => { cancel(); manual(); measure(false); };
    const canFollow = () => allowed && alive && !document.hidden && !hasSelection();
    const schedule = () => {
      if (!canFollow() || frame || timer !== undefined) return;
      follow();
      if (tail() - paintedOffset() < 1) return;
      timer = setTimeout(start, Math.max(0, nextAt - performance.now()));
    };
    const start = () => {
      timer = undefined;
      if (!canFollow()) return;
      const from = paintedOffset();
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || 24;
      const target = reasoningTarget(from, text.offsetHeight, port.clientHeight, lineHeight);
      if (target - from < 1) return;
      const began = performance.now();
      nextAt = began + REASON_HOLD;
      targetOffset = target;
      // The supplied recipe: commit the start pose, then transition the track.
      // No per-frame scrollTop writes and no catch-up across unread lines.
      scrollTrack.style.transition = 'none';
      scrollTrack.style.transform = `translateY(-${from}px)`;
      void scrollTrack.offsetHeight;
      scrollTrack.style.transition = 'transform var(--reason-step) var(--reason-ease)';
      scrollTrack.style.transform = `translateY(-${target}px)`;
      port.dataset.reasoningMoving = 'true';
      port.dataset.reasoningFrom = String(from);
      port.dataset.reasoningTarget = String(target);
      port.dataset.reasoningBegan = String(began);
      const tick = (now: number) => {
        frame = 0;
        if (!canFollow()) { cancel(); manual(); return; }
        // Observe the browser's actual CSS interpolation for masks and handoff.
        measure();
        if (now - began < REASON_STEP || Math.abs(lastPainted - target) > .05) frame = requestAnimationFrame(tick);
        else { delete port.dataset.reasoningMoving; schedule(); }
      };
      frame = requestAnimationFrame(tick);
    };
    const onScroll = () => {
      measure();
      // Focus/keyboard-induced native scroll wins even while the track moves.
      if (automatic && port.scrollTop > 1) pause();
    };
    const onWheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      // The compositor picks a wheel scroller before handlers run. A clipped
      // transform viewport would otherwise lose this first gesture or scroll
      // the conversation. Consume only this handoff; later wheels stay native.
      const handoff = automatic && event.cancelable;
      if (handoff) event.preventDefault();
      const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? parseFloat(getComputedStyle(text).lineHeight) || 24
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE ? port.clientHeight : 1;
      pause();
      if (handoff) { port.scrollTop = clamp(port.scrollTop + event.deltaY * unit); measure(); }
    };
    const onSelection = () => { if (hasSelection()) pause(); };
    const onVisibility = () => {
      cancel(); manual();
      nextAt = performance.now() + REASON_HOLD;
      if (!document.hidden) schedule();
    };
    const observer = new ResizeObserver(() => {
      if (automatic && targetOffset > tail() + 1) {
        cancel(); manual();
        nextAt = performance.now() + REASON_HOLD;
      }
      measure(); schedule();
    });
    observer.observe(text); observer.observe(port);
    port.addEventListener('scroll', onScroll, { passive: true });
    port.addEventListener('wheel', onWheel, { passive: false });
    document.addEventListener('selectionchange', onSelection);
    document.addEventListener('visibilitychange', onVisibility);
    // Keep the previous layout height until the resize effect can sample it.
    measure(false); schedule();
    return () => {
      alive = false; cancel(); manual(); observer.disconnect();
      port.removeEventListener('scroll', onScroll); port.removeEventListener('wheel', onWheel);
      document.removeEventListener('selectionchange', onSelection);
      document.removeEventListener('visibilitychange', onVisibility);
      stopFollow.current = () => {};
    };
  }, [allowed, pause]);

  useLayoutEffect(() => {
    const port = viewport.current;
    if (!port) return;
    const changed = expanded !== previousExpanded.current;
    previousExpanded.current = expanded;
    const from = resize.current ? port.clientHeight : lastHeight.current;
    resize.current?.cancel(); resize.current = null;
    port.style.maxHeight = ''; port.style.height = '';
    const target = port.clientHeight;
    // Explicit reading adjusts only the conversation, never the outer app.
    // The card is also a reader anchor so resizing cannot pin a later answer
    // in place at the expense of this card's visible heading.
    if (changed && !selected) {
      const card = port.parentElement;
      const host = port.closest<HTMLElement>('[data-conversation-scroll]');
      if (card && host) {
        const composer = parseFloat(getComputedStyle(host).getPropertyValue('--dsh-composer-height')) || 152;
        const region = host.getBoundingClientRect();
        const box = card.getBoundingClientRect();
        const top = region.top + 16;
        const bottom = region.bottom - composer - 16;
        const delta = box.top < top ? box.top - top : box.bottom > bottom ? Math.min(box.bottom - bottom, box.top - top) : 0;
        if (Math.abs(delta) > 1) host.scrollTo({ top: Math.max(0, host.scrollTop + delta), behavior: motion ? 'smooth' : 'instant' });
      }
    }
    if (!changed || !motion || from < 1 || Math.abs(target - from) < 1) {
      lastHeight.current = target;
      return;
    }
    // max-height otherwise clamps the very first collapse frame to the new cap.
    port.style.maxHeight = 'none';
    const animation = port.animate([{ height: `${from}px` }, { height: `${target}px` }], { duration: 300, easing: EASING, fill: 'both' });
    resize.current = animation;
    animation.onfinish = () => {
      if (resize.current !== animation) return;
      resize.current = null; animation.cancel();
      port.style.maxHeight = ''; port.style.height = '';
      lastHeight.current = port.clientHeight;
    };
  }, [expanded, motion, selected]);
  useEffect(() => () => resize.current?.cancel(), []);

  const toggleReading = () => {
    // Resize the same transcript without changing follow intent or position.
    // Wheel, selection and viewport focus still explicitly pause following.
    onRead();
    setExpanded(value => !value);
  };

  return <div className={css.reasonCard} data-reader-reasoning-card data-reader-anchor data-expanded={expanded} data-following={allowed} data-overflow={overflow} data-ud-motion="reader-reasoning-size">
    <div className={css.reasonHeading} data-reader-reasoning-heading data-ud-check="reasoning-identity">
      <span className={css.reasonLabel} data-reader-reasoning-label>思考</span>
      <span>步骤 {step}</span>
    </div>
    <div ref={viewport} id={controls} className={css.reasonViewport} data-reader-reasoning-scroll data-edges={edges}
      data-ud-motion="reader-reasoning-scroll" role="region" aria-label={`步骤 ${step} 的思考${overflow ? '，可滚动阅读' : ''}`}
      tabIndex={overflow ? 0 : undefined} onPointerDown={pause} onFocus={pause}>
      <div ref={track} className={css.reasonTrack} data-reader-reasoning-track>
        <div ref={content} className={css.reasonText} data-reader-reasoning-text>{children}</div>
      </div>
    </div>
    {(overflow || expanded) && <div className={css.reasonFooter} data-ud-check="reasoning-controls">
      {active && motion ? <button type="button" className={css.reasonAction} disabled={selected} aria-controls={controls}
        aria-label={following ? '暂停自动跟随思考' : '继续跟随最新思考'}
        title={selected ? '取消文字选择后可继续跟随' : undefined}
        onClick={() => { if (following) pause(); else { onRead(); setFollowing(true); } }}>
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">{following ? <path d="M5.5 4v8m5-8v8" /> : <path d="M8 3v10m-4-4 4 4 4-4" />}</svg>
        {following ? '暂停跟随' : '跟随最新'}
      </button> : <span className={css.reasonCaption}>{expanded ? '手动阅读' : '可滚动阅读'}</span>}
      <button type="button" className={css.reasonAction} aria-expanded={expanded} aria-controls={controls}
        aria-label={expanded ? '收起完整思考' : '展开阅读完整思考'} onClick={toggleReading}>
        {expanded ? '收起' : '展开阅读'}
        <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">{expanded ? <path d="m4 10 4-4 4 4" /> : <path d="m4 6 4 4 4-4" />}</svg>
      </button>
    </div>}
  </div>;
}
