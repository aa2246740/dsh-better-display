import { memo, useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent, RefObject } from 'react';
import type { ReaderGroup } from './projection.js';
import { activeRailTurn, railFrameStyle, railMarkStyle, RAIL_FADE_PX, RAIL_INSET_PX, RAIL_SPACING_PX, turnRailItems } from './turn-rail.js';
import css from './Reader.module.css';

/** Decorative marks for history that is not loaded yet; clicking loads one older batch. */
const GHOST_MARKS = 3;
/** Same near-bottom threshold as the native chat view and our jump button. */
const AT_BOTTOM_PX = 25;
const BUSY_SETTLE_MS = 450;

interface TurnRailProps {
  root: RefObject<HTMLDivElement>;
  groups: readonly ReaderGroup[];
  hasMore: boolean;
  loadOlder: () => Promise<void>;
  previewLabel: (turn: number | null) => string;
}

interface RailPreview { turn: number | null; ghost: boolean; index: number }

function portOf(content: HTMLElement): HTMLElement {
  return content.closest<HTMLElement>('[data-conversation-scroll]') ?? content;
}

/**
 * Vertical turn navigator for the reading view, ported from the native chat
 * TurnNavigator: one tick per loaded turn, active tick follows the reading
 * line, clicks land on the turn's section, and unloaded history shows as
 * shortened ghost ticks that load one older batch per click.
 */
export const TurnRail = memo(function TurnRail({ root, groups, hasMore, loadOlder, previewLabel }: TurnRailProps) {
  const items = turnRailItems(groups);
  const ghosts = hasMore ? GHOST_MARKS : 0;
  const total = items.length + ghosts;
  const [activeTurn, setActiveTurn] = useState<number | null>(() => items.at(-1)?.turn ?? null);
  const [busyTurn, setBusyTurn] = useState<number | null>(null);
  const [preview, setPreview] = useState<RailPreview | null>(null);
  const [railTop, setRailTop] = useState(0);
  const [railEdges, setRailEdges] = useState({ up: false, down: false });
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pointerInside = useRef(false);
  const settleRef = useRef(0);
  /** Section tops in port content coordinates; rebuilt on content resize only, so
   * scroll frames resolve the active turn by binary search with zero DOM reads. */
  const marksRef = useRef<{ turn: number; top: number }[]>([]);

  const rebuildMarks = useCallback(() => {
    const content = root.current;
    if (!content) { marksRef.current = []; return; }
    const port = portOf(content);
    const base = port.getBoundingClientRect().top - port.scrollTop;
    const marks: { turn: number; top: number }[] = [];
    for (const section of content.querySelectorAll<HTMLElement>('[data-reader-turn]')) {
      const turn = Number(section.dataset.readerTurn);
      if (!Number.isInteger(turn)) continue;
      marks.push({ turn, top: section.getBoundingClientRect().top - base });
    }
    marksRef.current = marks;
  }, [root]);

  const syncActive = useCallback(() => {
    const content = root.current;
    const first = items[0];
    if (!content || !first) { setActiveTurn(null); return; }
    const port = portOf(content);
    const latest = items.at(-1)?.turn ?? first.turn;
    if (port.scrollHeight - port.scrollTop - port.clientHeight <= AT_BOTTOM_PX) {
      setActiveTurn(current => current === latest ? current : latest);
      return;
    }
    const line = port.scrollTop + Math.min(96, port.clientHeight * 0.2);
    let reading: number | null = null;
    const marks = marksRef.current;
    let lo = 0, hi = marks.length - 1, index = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (marks[mid].top <= line) { index = mid; lo = mid + 1; } else hi = mid - 1;
    }
    if (index >= 0) reading = marks[index].turn;
    setActiveTurn(current => {
      const next = activeRailTurn(items, reading);
      return current === next ? current : next;
    });
  }, [items, root]);

  useEffect(() => {
    const content = root.current;
    if (!content || items.length === 0) return;
    const port = portOf(content);
    let frame = 0;
    const schedule = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; syncActive(); });
    };
    port.addEventListener('scroll', schedule, { passive: true });
    const observer = new ResizeObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; rebuildMarks(); syncActive(); });
    });
    observer.observe(content);
    if (port !== content) observer.observe(port);
    rebuildMarks();
    syncActive();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      port.removeEventListener('scroll', schedule);
      observer.disconnect();
    };
  }, [items, root, syncActive, rebuildMarks]);

  // Keep the active mark inside the rail's own viewport; never move it under the pointer.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const index = activeTurn === null ? -1 : items.findIndex(item => item.turn === activeTurn);
    if (!scroller || index < 0 || pointerInside.current) return;
    const markTop = (index + ghosts) * RAIL_SPACING_PX + RAIL_INSET_PX;
    const viewTop = scroller.scrollTop;
    const viewHeight = scroller.clientHeight;
    if (viewHeight <= 0 || (markTop >= viewTop + RAIL_FADE_PX && markTop <= viewTop + viewHeight - RAIL_FADE_PX)) return;
    const target = Math.max(0, markTop - viewHeight / 2);
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({ top: target, behavior: reduced ? 'auto' : 'smooth' });
  }, [activeTurn, items, ghosts]);

  useEffect(() => () => { if (settleRef.current) window.clearTimeout(settleRef.current); }, []);

  const navigateTo = useCallback((turn: number) => {
    const content = root.current;
    if (!content) return;
    const section = content.querySelector<HTMLElement>(`[data-reader-turn="${turn}"]`);
    if (!section) return;
    const port = portOf(content);
    const top = section.getBoundingClientRect().top - port.getBoundingClientRect().top + port.scrollTop;
    setBusyTurn(turn);
    if (settleRef.current) window.clearTimeout(settleRef.current);
    settleRef.current = window.setTimeout(() => setBusyTurn(current => current === turn ? null : current), BUSY_SETTLE_MS);
    port.scrollTo({ top, behavior: 'instant' });
  }, [root]);

  const syncRailScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    setRailTop(scroller.scrollTop);
    setRailEdges({ up: scroller.scrollTop > 1, down: scroller.scrollTop < scroller.scrollHeight - scroller.clientHeight - 1 });
  }, []);

  const markIndexAt = (clientY: number, frame: HTMLElement): number => {
    const scrollTop = scrollerRef.current?.scrollTop ?? 0;
    const offset = clientY - frame.getBoundingClientRect().top + scrollTop - RAIL_INSET_PX;
    return Math.max(0, Math.min(total - 1, Math.round(offset / RAIL_SPACING_PX)));
  };

  const previewAtPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const index = markIndexAt(event.clientY, event.currentTarget);
    if (index < ghosts) setPreview({ turn: null, ghost: true, index });
    else setPreview({ turn: items[index - ghosts].turn, ghost: false, index });
  };

  const navigateAtPointer = (event: ReactMouseEvent<HTMLElement>) => {
    const index = markIndexAt(event.clientY, event.currentTarget);
    if (index < ghosts) void loadOlder();
    else navigateTo(items[index - ghosts].turn);
  };

  if (total < 2) return null;
  const scrollerClass = [css.railScroller, railEdges.up ? css.railFadeTop : '', railEdges.down ? css.railFadeBottom : ''].filter(Boolean).join(' ');
  return <div className={css.railSlot}>
    <nav className={css.railFrame} style={railFrameStyle(total, railTop)} aria-label="轮次导航"
      onPointerMove={previewAtPointer}
      onPointerEnter={() => { pointerInside.current = true; }}
      onPointerLeave={() => { pointerInside.current = false; setPreview(null); }}
      onClick={navigateAtPointer}>
      <div ref={scrollerRef} className={scrollerClass} onScroll={syncRailScroll}>
        <div className={css.railMarks}>
          {Array.from({ length: ghosts }, (_, index) => <div key={`ghost:${index}`} className={css.railMarkPosition} style={railMarkStyle(index)}>
            <button type="button" className={css.railMark} data-ghost="true" aria-label="加载更早的轮次"
              onClick={event => { event.stopPropagation(); void loadOlder(); }}
              onFocus={() => setPreview({ turn: null, ghost: true, index })} onBlur={() => setPreview(null)} />
          </div>)}
          {items.map((item, index) => {
            const active = item.turn === activeTurn;
            return <div key={item.turn} className={css.railMarkPosition} style={railMarkStyle(index + ghosts)}>
              <button type="button" className={css.railMark}
                data-active={active ? 'true' : undefined}
                data-preview={preview?.turn === item.turn ? 'true' : undefined}
                data-busy={item.turn === busyTurn ? 'true' : undefined}
                aria-label={`跳到第 ${item.turn} 轮`} aria-current={active ? 'true' : undefined}
                aria-busy={item.turn === busyTurn ? 'true' : undefined}
                onClick={event => { event.stopPropagation(); navigateTo(item.turn); }}
                onFocus={() => setPreview({ turn: item.turn, ghost: false, index: index + ghosts })} onBlur={() => setPreview(null)} />
            </div>;
          })}
        </div>
      </div>
      {preview && <div className={css.railPreview} style={railMarkStyle(preview.index)}>{previewLabel(preview.turn)}</div>}
    </nav>
  </div>;
});
