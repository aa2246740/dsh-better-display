import { useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import css from './Reader.module.css';
import { StreamMotionContext } from './streaming.js';

const EASING = 'cubic-bezier(.22,1,.36,1)';

export function useMotionAllowed(enabled: boolean): boolean {
  const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => setReduced(query.matches);
    query.addEventListener('change', change);
    return () => query.removeEventListener('change', change);
  }, []);
  return enabled && !reduced;
}

export function usePinnedSelection(root: RefObject<HTMLElement>, selector = '[data-reader-answer], [data-reader-process]'): readonly string[] {
  const [keys, setKeys] = useState<readonly string[]>([]);
  useEffect(() => {
    const update = () => {
      const selection = document.getSelection();
      const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
      const next = range && root.current
        ? [...new Set(Array.from(root.current.querySelectorAll<HTMLElement>(selector))
          .filter(element => range.intersectsNode(element))
          .map(element => element.dataset.readerKey ?? element.dataset.readerProcessKey!).filter(Boolean))]
        : [];
      setKeys(previous => previous.length === next.length && previous.every((key, index) => key === next[index]) ? previous : next);
    };
    document.addEventListener('selectionchange', update);
    return () => document.removeEventListener('selectionchange', update);
  }, [root, selector]);
  return keys;
}

export function StatusText({ text, motion, shimmer = false }: { text: string; motion: boolean; shimmer?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [forcedColors, setForcedColors] = useState(() => window.matchMedia('(forced-colors: active)').matches);
  const allowed = motion && visible && !forcedColors;
  const [frame, setFrame] = useState<{
    text: string; id: number; phase: 'idle' | 'start' | 'running';
    outgoing: { text: string; id: number } | null;
  }>({ text, id: 0, phase: 'idle', outgoing: null });
  // Adjust before commit, so a new label cannot paint once before its entry state.
  // Reuse the previous incoming key: a rapid change exits from its current pose.
  if (frame.text !== text) setFrame({
    text, id: frame.id + 1, phase: allowed ? 'start' : 'idle',
    outgoing: allowed ? { text: frame.text, id: frame.id } : null,
  });
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    const query = window.matchMedia('(forced-colors: active)');
    const colors = () => setForcedColors(query.matches);
    document.addEventListener('visibilitychange', update);
    query.addEventListener('change', colors);
    return () => { document.removeEventListener('visibilitychange', update); query.removeEventListener('change', colors); };
  }, []);
  useLayoutEffect(() => {
    const id = frame.id;
    const settle = () => setFrame(current => current.id === id && current.outgoing
      ? { ...current, phase: 'idle', outgoing: null } : current);
    if (!allowed) { settle(); return; }
    if (!frame.outgoing || !ref.current) return;
    // Commit the supplied .is-enter-start pose before releasing CSS transitions.
    ref.current.getBoundingClientRect();
    let timer = 0;
    const tick = requestAnimationFrame(() => {
      setFrame(current => current.id === id ? { ...current, phase: 'running' } : current);
      timer = window.setTimeout(settle, 200); // 150ms swap + 50ms incoming gap.
    });
    return () => { cancelAnimationFrame(tick); window.clearTimeout(timer); };
  }, [frame.id, allowed]);
  const active = shimmer && allowed;
  const swapping = allowed && frame.outgoing !== null;
  return <span className={css.statusText} data-reader-status data-reader-busy={shimmer} data-ud-check="reader-status">
    <span className={css.think} aria-hidden="true" data-active={active} data-reader-status-phase={swapping ? frame.phase : 'idle'} data-ud-motion="reader-thinking-state">
      <span className={css.thinkSizer}>{text}</span>
      {swapping && <span key={frame.outgoing!.id} className={`${css.thinkText} ${frame.phase === 'running' ? css.isExit : ''}`}
        data-reader-status-copy="outgoing" data-text={frame.outgoing!.text}>{frame.outgoing!.text}</span>}
      <span key={frame.id} ref={ref} className={`${css.thinkText} ${swapping && frame.phase === 'start' ? css.isEnterStart : ''}`}
        data-reader-status-copy="current" data-reader-shimmer={active || undefined} data-text={text}>{text}</span>
    </span>
    <span className={css.srOnly} role="status" aria-live="polite" aria-atomic="true">{text}</span>
  </span>;
}

export function Disclosure({ open, onChange, label, controls, buttonRef, ariaLabel }: {
  open: boolean; onChange: (value: boolean) => void; label: ReactNode;
  controls?: string; buttonRef: RefObject<HTMLButtonElement>;
  ariaLabel?: string;
}) {
  const name = ariaLabel ?? '思考与过程';
  return <div className={css.disclosure} data-reader-disclosure data-expanded={open}>
    <button ref={buttonRef} type="button" className={css.disclosureButton} aria-label={`${open ? '收起' : '展开'}${name}`} aria-expanded={open} {...(controls ? { 'aria-controls': controls } : {})} onClick={() => onChange(!open)}>
      {label}
      <svg className={css.chevron} data-open={open} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
    </button>
  </div>;
}

/** Supplemental details stay in source order beside their own narration. */
export function ProcessFragment({ open, motion, onRead, returnFocusTo, nodeKey, children, framed = false }: {
  open: boolean; motion: boolean; onRead: () => void; nodeKey: string;
  returnFocusTo: RefObject<HTMLElement>; children: ReactNode; framed?: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const running = useRef<Animation | null>(null);
  const previous = useRef(open);
  const [present, setPresent] = useState(open);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) return;
    const from = running.current ? element.getBoundingClientRect().height : previous.current ? element.scrollHeight : 0;
    running.current?.cancel();
    running.current = null;
    const changed = previous.current !== open;
    previous.current = open;
    if (open) setPresent(true);
    if (!open && element.contains(document.activeElement)) returnFocusTo.current?.focus();
    element.style.height = open ? 'auto' : '0px';
    const target = open ? element.scrollHeight : 0;
    if (!motion || !changed || Math.abs(from - target) < 1) {
      setPresent(open);
      return;
    }
    if (from > target && motion) {
      document.body.dataset.readerFolding = 'true';
    }
    const animation = element.animate(
      from > target
        ? [
            { offset: 0, height: `${from}px`, opacity: 1, transform: 'scaleY(1) translateY(0)' },
            { offset: 0.32, height: `${Math.round(from * 0.92)}px`, opacity: 0.35, transform: 'scaleY(0.96) translateY(-2px)' },
            { offset: 1, height: `${target}px`, opacity: 0, transform: 'scaleY(0.68) translateY(-8px)' },
          ]
        : [
            { offset: 0, height: `${from}px`, opacity: 0, transform: 'scaleY(0.8) translateY(6px)' },
            { offset: 0.3, height: `${Math.round(target * 0.4)}px`, opacity: 0.4, transform: 'scaleY(0.92) translateY(3px)' },
            { offset: 1, height: `${target}px`, opacity: 1, transform: 'scaleY(1) translateY(0)' },
          ],
      { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' },
    );
    running.current = animation;
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      if (running.current === animation) running.current = null;
      delete document.body.dataset.readerFolding;
      animation.cancel();
      setPresent(open);
    };
    animation.onfinish = settle;
    // `fill: 'both'\` pins the opening keyframe (height 0, opacity 0), so while this
    // animation runs the body is *invisible* no matter what the element's style says.
    // An animation that never finishes — cancelled by a re-run, an unmount, or a
    // compositor that drops it — would then leave the row looking like it refused to
    // open, which is exactly the reported symptom. Cancel is only safe once the
    // state change has been committed, so the deadline does both.
    const deadline = window.setTimeout(settle, 380 + 240);
    return () => {
      window.clearTimeout(deadline);
      running.current?.cancel();
      delete document.body.dataset.readerFolding;
    };
  }, [open, motion, returnFocusTo]);
  if (!open && !present) return null;
  return <div ref={body} className={css.disclosureBody} data-reader-process data-reader-process-key={nodeKey} data-ud-motion="reader-process-size"
    aria-hidden={!open} onPointerDown={() => { if (open) onRead(); }} onFocusCapture={() => { if (open) onRead(); }} {...(!open ? { inert: '' } : {})}>
    <div className={framed ? css.processFrame : css.processContents}>{children}</div>
  </div>;
}

/** Retire only narration that was actually visible; historical rows stay folded. */
export function RetiringContent({ visible, children }: { visible: boolean; children: ReactNode }) {
  const { enabled } = useContext(StreamMotionContext);
  const root = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const [present, setPresent] = useState(visible);
  const [focusHeld, setFocusHeld] = useState(false);
  useLayoutEffect(() => {
    const element = root.current;
    if (visible) {
      animation.current?.cancel(); animation.current = null;
      setPresent(true);
      return;
    }
    if (!element) return;
    if (element.contains(document.activeElement)) { setFocusHeld(true); return; }
    if (focusHeld) return;
    const from = element.getBoundingClientRect().height;
    animation.current?.cancel(); animation.current = null;
    if (!enabled || from < 1) { setPresent(false); return; }
    const next = element.animate([{ height: `${from}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 220, easing: EASING, fill: 'both' });
    animation.current = next;
    next.onfinish = () => { if (animation.current === next) { animation.current = null; next.cancel(); setPresent(false); } };
  }, [visible, enabled, focusHeld]);
  useEffect(() => () => animation.current?.cancel(), []);
  if (!visible && !present) return null;
  return <div ref={root} className={css.retiringContent} data-reader-retiring={visible ? 'visible' : 'retiring'} data-ud-motion="reader-progress-retire"
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setFocusHeld(false); }}>
    {children}
  </div>;
}

// DOM-only behavior: the native Session remains the sole source of business data.
export function useReadingScroll(root: RefObject<HTMLElement>, motion: boolean): {
  detached: boolean;
  jump: () => void;
  /** Stop tail-follow so a rail landing is not pulled back to the live bottom. */
  release: () => void;
} {
  const port = useRef<HTMLElement | null>(null);
  const following = useRef(true);
  // Tracked separately from `following`: only an explicit reader action clears
  // this, so a fold-induced scroll clamp cannot permanently drop the tail.
  const pinned = useRef(true);
  const anchor = useRef<{ element: HTMLElement; docTop: number } | null>(null);
  const cancelFollow = useRef<() => void>(() => {});
  const [detached, setDetached] = useState(false);
  useLayoutEffect(() => {
    const content = root.current;
    if (!content) return;
    const scroll = content.closest<HTMLElement>('[data-conversation-scroll]') ?? content;
    port.current = scroll;
    // Browser scroll anchoring moves the viewport on its own as the transcript
    // grows, which reads as the page freezing mid-follow.
    const previousOverflowAnchor = scroll.style.overflowAnchor;
    scroll.style.overflowAnchor = 'none';
    let followFrame = 0;
    let lastFrameAt = 0;
    let layoutDepth = 0;
    let lastWrittenTop: number | null = null;
    const layoutStart = () => {
      layoutDepth++;
      cancelAnimationFrame(followFrame); followFrame = 0;
      capture();
    };
    const layoutEnd = () => {
      layoutDepth = Math.max(0, layoutDepth - 1);
      if (!layoutDepth && following.current && !followFrame) {
        lastFrameAt = performance.now(); followFrame = requestAnimationFrame(follow);
      }
    };
    cancelFollow.current = () => {
      cancelAnimationFrame(followFrame);
      followFrame = 0;
      lastWrittenTop = null;
    };
    const selected = () => {
      const selection = document.getSelection();
      return selection && !selection.isCollapsed && selection.anchorNode && content.contains(selection.anchorNode);
    };
    // Only a focused text field suspends tail-follow. Clicking a fold control
    // inside the reader also moves document.activeElement into `content`, and
    // treating that as "user is busy" froze following for the rest of the turn.
    const editingText = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      // The composer lives outside this subtree: focusing it must never stop
      // the transcript from following.
      if (!content.contains(active)) return false;
      return active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT';
    };
    const capture = () => {
      const top = scroll.getBoundingClientRect().top;
      const candidates = content.querySelectorAll<HTMLElement>('[data-reader-anchor]');
      let candidate: HTMLElement | null = null;
      for (let index = 0; index < candidates.length; index++) {
        const element = candidates[index];
        if (element.getBoundingClientRect().bottom > top + 8) { candidate = element; break; }
      }
      // Record the anchor in DOCUMENT space, never viewport space. The viewport
      // offset also changes whenever the reader scrolls, so comparing it back
      // turned a plain scroll into an "anchor correction" that yanked the
      // viewport back to wherever the anchor had last been captured.
      anchor.current = candidate
        ? { element: candidate, docTop: candidate.getBoundingClientRect().top + scroll.scrollTop }
        : null;
    };
    // Anchor capture is only consumed while detached; coalesce DOM scans to one per frame.
    let captureFrame = 0;
    const scheduleCapture = () => {
      if (captureFrame) return;
      captureFrame = requestAnimationFrame(() => { captureFrame = 0; capture(); });
    };
    const atBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 25;
    // Intent to stay pinned to the bottom, tracked independently of the scroll
    // position. A fold collapse shrinks the transcript and the browser clamps
    // scrollTop, producing a scroll event indistinguishable from the reader
    // scrolling up; without this the reader silently detached exactly when the
    // turn's last content arrived, and the page stopped following.
    pinned.current = true;
    const onScroll = () => {
      // While a follow animation is actively driving scroll, do not cancel following midway.
      if (followFrame !== 0 || layoutDepth > 0) return;
      // Our easing frames must not be mistaken for a user leaving the bottom.
      if (lastWrittenTop !== null && Math.abs(scroll.scrollTop - lastWrittenTop) < 1) return;
      // Bind the follow intent to the position observed HERE. Every scroll that
      // reaches this point is the viewport moving under someone else's hand: a
      // wheel, a drag, a key, or the browser clamping the offset after a shrink.
      //
      // The previous form inferred detaching from a strictly upward delta against
      // lastWrittenTop, which left two holes. That baseline is nulled by
      // cancelFollow/onWheel/onTouch/onKey, and the guard above already returned
      // for any scroll whose delta is under 1px — so a reader parked mid-transcript
      // by a scrollbar drag stayed following === true AND pinned === true. The next
      // content growth then took the re-attach branch and yanked the viewport to
      // the bottom, discarding what they were reading. Reading the position
      // directly needs no baseline: a fold's clamp lands at the very bottom and
      // still keeps following, while any other offset detaches.
      const bottom = atBottom();
      pinned.current = bottom;
      if (!bottom) { cancelAnimationFrame(followFrame); followFrame = 0; scheduleCapture(); }
      if (!following.current) {
        // Only an explicit return to the bottom resumes following.
        if (bottom) { following.current = true; setDetached(false); }
        return;
      }
      if (!bottom) { following.current = false; setDetached(true); }
    };
    const onWheel = (event: WheelEvent) => {
      cancelAnimationFrame(followFrame); followFrame = 0; lastWrittenTop = null;
      if (event.deltaY < 0) { following.current = false; setDetached(true); pinned.current = false; scheduleCapture(); }
    };
    const onTouch = () => {
      cancelAnimationFrame(followFrame); followFrame = 0; lastWrittenTop = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('textarea,input,[contenteditable=true]')) return;
      if (['PageUp', 'Home', 'ArrowUp'].includes(event.key)) {
        cancelAnimationFrame(followFrame); followFrame = 0; lastWrittenTop = null;
        following.current = false; setDetached(true); pinned.current = false; scheduleCapture();
      }
    };
    const writeTop = (top: number) => { scroll.scrollTop = top; lastWrittenTop = scroll.scrollTop; };
    const follow = (now: number) => {
      followFrame = 0;
      if (!following.current || selected() || editingText()) return;
      if (layoutDepth > 0) return;
      const gap = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
      const delta = Math.min(48, Math.max(1, now - lastFrameAt));
      lastFrameAt = now;
      if (!motion || Math.abs(gap) < 1.5) { writeTop(scroll.scrollHeight); capture(); return; }
      writeTop(scroll.scrollTop + gap * (1 - Math.exp(-delta / 52)));
      followFrame = requestAnimationFrame(follow);
    };
    const firstFrame = requestAnimationFrame(() => {
      if (following.current && !selected()) writeTop(scroll.scrollHeight);
      capture();
    });
    let lastHeight = content.scrollHeight;
    const observer = new ResizeObserver(() => {
      if (selected()) return;
      const height = scroll.scrollHeight;
      const grew = height > lastHeight + 1;
      lastHeight = height;
      // Growth while the reader intends to be at the bottom re-attaches the
      // tail. This is the self-healing path for the clamp case above and is
      // also what keeps the viewport moving when a turn ends.
      if (grew && pinned.current && !editingText()) { following.current = true; setDetached(false); }
      if (following.current && !editingText()) {
        // Height is already animated: no second, lagging scroll easing.
        if (!motion || layoutDepth > 0) writeTop(scroll.scrollHeight);
        else if (!followFrame) { lastFrameAt = performance.now(); followFrame = requestAnimationFrame(follow); }
      } else if (!following.current && anchor.current?.element.isConnected) {
        // Only a real layout change above the anchor needs compensation. A reader
        // scroll moves the viewport offset but not the document offset, so this
        // stays silent while the reader is scrolling and cannot snap back.
        const delta = anchor.current.element.getBoundingClientRect().top + scroll.scrollTop - anchor.current.docTop;
        if (Math.abs(delta) > .5) writeTop(scroll.scrollTop + delta);
      }
      capture();
    });
    observer.observe(content);
    if (scroll !== content) observer.observe(scroll);
    content.addEventListener('reader-layout-start', layoutStart);
    content.addEventListener('reader-layout-end', layoutEnd);
    scroll.addEventListener('scroll', onScroll, { passive: true });
    scroll.addEventListener('wheel', onWheel, { passive: true });
    scroll.addEventListener('touchstart', onTouch, { passive: true });
    scroll.addEventListener('touchmove', onTouch, { passive: true });
    scroll.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(firstFrame); cancelAnimationFrame(followFrame); cancelAnimationFrame(captureFrame); observer.disconnect();
      content.removeEventListener('reader-layout-start', layoutStart);
      content.removeEventListener('reader-layout-end', layoutEnd);
      scroll.style.overflowAnchor = previousOverflowAnchor;
      scroll.removeEventListener('scroll', onScroll); scroll.removeEventListener('wheel', onWheel);
      scroll.removeEventListener('touchstart', onTouch); scroll.removeEventListener('touchmove', onTouch);
      scroll.removeEventListener('keydown', onKey);
    };
  }, [root, motion]);
  const jump = useCallback(() => {
    cancelFollow.current();
    anchor.current = null;
    following.current = true;
    pinned.current = true;
    setDetached(false);
    if (port.current) {
      port.current.scrollTop = port.current.scrollHeight;
    }
  }, []);
  const release = useCallback(() => {
    cancelFollow.current();
    following.current = false;
    pinned.current = false;
    anchor.current = null;
    setDetached(true);
  }, []);
  return { detached, jump, release };
}
