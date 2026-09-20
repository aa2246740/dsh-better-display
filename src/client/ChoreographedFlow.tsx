import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { ReaderProps } from './types.js';
import type { LiveStep, LiveTurnItem } from './live-turn.js';
import { collapseRows, containsNewUser, flowRows, FOLD_TIMING, retiringKeys } from './fold-choreography.js';
import type { FoldPhase } from './fold-choreography.js';
import { Disclosure } from './motion.js';
import { FoldSummaryText } from './LiveFold.js';
import { DiffStat } from './DiffPanel.js';
import { StreamMotionContext } from './streaming.js';
import css from './Reader.module.css';

const FlowSnapshot = createContext<ChatSnapshot | null>(null);
/** Public projection only. Descendants cannot leak live data through a frozen frame. */
export const useFlowChat: ReaderProps['useChat'] = selector => {
  const snapshot = useContext(FlowSnapshot);
  if (!snapshot) throw new Error('Flow snapshot provider missing');
  return selector(snapshot);
};

export type PresentationFrame = { items: readonly LiveTurnItem[]; snapshot: ChatSnapshot };
type Transaction = {
  phase: FoldPhase; shown: PresentationFrame; target: PresentationFrame;
  retiring: readonly string[]; beforeKeys: ReadonlySet<string>;
};
const idle = (frame: PresentationFrame): Transaction => ({ phase: 'idle', shown: frame, target: frame, retiring: [], beforeKeys: new Set() });

function Summary({ item, open, onChange, motion }: {
  item: Extract<LiveTurnItem, { kind: 'fold' }>; open: boolean; onChange: (open: boolean) => void; motion: boolean;
}) {
  const button = useRef<HTMLButtonElement>(null);
  return <div data-reader-live-fold data-expanded={open} data-reader-live-fold-summary={item.summary}
    data-reader-fold-named={item.named ? 'on' : undefined}>
    <div className={css.summaryRow}>
      <Disclosure open={open} onChange={onChange} buttonRef={button} ariaLabel="此前步骤"
        label={<FoldSummaryText summary={item.summary} motion={motion} />} />
      <DiffStat steps={item.steps} label={item.summary} />
    </div>
  </div>;
}

/** Manual disclosure shares the measured-size path; children survive until finish. */
function FlowCell({ hidden, instant, motion, rowKey, children, summary = false }: {
  hidden: boolean; instant: boolean; motion: boolean; rowKey: string; children: ReactNode; summary?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [present, setPresent] = useState(!hidden);
  const previous = useRef(hidden);
  if (!hidden && !present) setPresent(true);
  useLayoutEffect(() => {
    const el = ref.current;
    const changed = previous.current !== hidden;
    previous.current = hidden;
    if (!el) return;
    if (!changed || instant || !motion) { setPresent(!hidden); return; }
    const height = el.scrollHeight;
    const animation = el.animate([
      { height: `${hidden ? height : 0}px`, opacity: hidden ? 1 : 0 },
      { height: `${hidden ? 0 : height}px`, opacity: hidden ? 0 : 1 },
    ], { duration: 220, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' });
    el.dispatchEvent(new CustomEvent('reader-layout-start', { bubbles: true }));
    let released = false;
    const release = () => { if (!released) { released = true; el.dispatchEvent(new CustomEvent('reader-layout-end', { bubbles: true })); } };
    // Do NOT cancel here. `fill: 'both'` is what currently holds the cell at its
    // collapsed size; cancelling on finish drops that fill before React has
    // committed the removal, so the cell snaps back to full height for one frame
    // — the flash before it disappears. The state change alone retires it; the
    // cleanup below cancels the animation once that has actually rendered.
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      setPresent(!hidden);
      release();
    };
    animation.onfinish = settle;
    // \`fill: 'both'\` pins the opening keyframe for the whole run, so if this
    // animation never advances the cell stays at height 0 and opacity 0: the row is
    // in the DOM but reads as "clicked it and nothing happened". A cancelled
    // animation, or one inside a subtree the compositor skips, never fires
    // onfinish. Fall back to the state change on a deadline; the cleanup then
    // cancels the animation and drops the fill.
    const deadline = window.setTimeout(settle, 220 + 240);
    return () => { window.clearTimeout(deadline); animation.cancel(); release(); };
    // `present` is a dependency so that committing it re-runs this effect: the
    // cleanup then cancels the finished animation *after* the removal has been
    // applied, which is the only moment the fill can be dropped safely. Without
    // it the animation was never cancelled at all and every folded cell kept one.
  }, [hidden, instant, motion, present]);
  return <div ref={ref} className={css.flowCell} data-flow-key={rowKey} data-flow-summary={summary || undefined}
    hidden={hidden && !present} aria-hidden={hidden || undefined} {...(hidden ? { inert: '' } : {})}>
    {present && <div className={css.flowCellInner}>{children}</div>}
  </div>;
}

export function ChoreographedFlow({ frame, motion, enabled, urgent, open, onOpenChange, processOpen, renderStep, id }: {
  frame: PresentationFrame; motion: boolean; enabled: boolean; urgent: boolean;
  open: Readonly<Record<string, boolean>>; onOpenChange: (key: string, value: boolean) => void;
  processOpen: boolean; renderStep: (step: LiveStep, folded: boolean) => ReactNode; id: string;
}) {
  const root = useRef<HTMLDivElement>(null);
  const stream = useContext(StreamMotionContext);
  const latest = useRef(frame); latest.current = frame;
  const [visible, setVisible] = useState(() => !document.hidden);
  const [state, setState] = useState<Transaction>(() => idle(frame));
  // `processOpen` is deliberately absent here: it means "the reader asked to
  // open everything", which is false in the normal case, and as a bypass term
  // it switched the whole fold choreography off. `enabled` already covers the
  // "this turn should not fold" case.
  const bypass = !motion || !enabled || urgent || !visible || !processOpen || (state.phase !== 'idle' && Object.values(open).some(Boolean));
  // Render-time adjustment prevents even one paint of the new authoritative layout.
  if ((bypass || containsNewUser(state.shown.items, frame.items)) && (state.phase !== 'idle' || state.shown !== frame)) {
    setState(idle(frame));
  } else if (state.phase === 'idle' && state.shown !== frame) {
    const retiring = retiringKeys(state.shown.items, frame.items, open, processOpen);
    setState(retiring.length ? { ...state, phase: 'collapse', target: frame, retiring,
      beforeKeys: new Set(flowRows(state.shown.items).map(row => row.key)) } : idle(frame));
  }
  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useLayoutEffect(() => {
    if (state.phase !== 'collapse') return;
    const el = root.current;
    if (!el) return;
    const retiring = new Set(state.retiring);
    const animations: Animation[] = [];
    el.dispatchEvent(new CustomEvent('reader-layout-start', { bubbles: true }));
    for (const cell of el.querySelectorAll<HTMLElement>(':scope > [data-flow-key]')) {
      const key = cell.dataset.flowKey!;
      const isHeader = cell.dataset.flowSummary && !state.beforeKeys.has(key);
      if (!retiring.has(key) && !isHeader) continue;
      const height = cell.getBoundingClientRect().height;
      animations.push(cell.animate(isHeader ? [
        { height: '0px', opacity: 0 }, { height: `${height}px`, opacity: 1 },
      ] : [
        { height: `${height}px`, opacity: 1 },
        { height: `${height * .5}px`, opacity: .85, offset: .5 },
        { height: '0px', opacity: 0 },
      ], { duration: FOLD_TIMING.collapse, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
    }
    let cancelled = false;
    // Coalesce everything received during shrink, once. No animation restarts.
    // Idempotent and phase-checked: the promise and the deadline race, and
    // whichever arrives first wins while the other becomes a no-op.
    let advanced = false;
    const advance = () => {
      if (cancelled || advanced) return;
      advanced = true;
      setState(current => current.phase === 'collapse' ? { ...current, phase: 'count', target: latest.current } : current);
    };
    // `finished` rejects when an animation is cancelled and can stay pending when a
    // compositor never runs it to completion, so the promise alone cannot be the only
    // way out of this phase. Without a deadline a stalled phase would hold the frame
    // source at `shown` and keep the reveal paused, which reads as a frozen turn
    // until the view remounts.
    const deadline = window.setTimeout(advance, FOLD_TIMING.collapse + FOLD_TIMING.watchdogSlack);
    Promise.all(animations.map(animation => animation.finished)).then(advance, advance);
    return () => {
      cancelled = true;
      window.clearTimeout(deadline);
      animations.forEach(animation => animation.cancel());
      el.dispatchEvent(new CustomEvent('reader-layout-end', { bubbles: true }));
    };
  }, [state.phase]);
  useEffect(() => {
    if (state.phase !== 'count' && state.phase !== 'settle' && state.phase !== 'reveal') return;
    const phase = state.phase;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      setState(current => {
        if (current.phase !== phase) return current;
        if (phase === 'count') return { ...current, phase: 'settle' };
        if (phase === 'settle') return { ...current, phase: 'reveal' };
        return idle(current.target);
      });
    };
    // Count visible presentation time, not a timer that can expire before a
    // busy browser paints. Each attention phase must get actual rendered frames.
    let elapsed = 0;
    let previous: number | undefined;
    let raf = 0;
    const tick = (now: number) => {
      if (previous !== undefined) elapsed += Math.min(40, now - previous);
      previous = now;
      if (elapsed < FOLD_TIMING[phase]) { raf = requestAnimationFrame(tick); return; }
      finish();
    };
    raf = requestAnimationFrame(tick);
    // A hidden tab gets no frames at all, so the frame counter above would never
    // reach its budget and the phase would hold forever. The wall-clock deadline
    // advances it anyway; a non-idle phase is what freezes the turn.
    const deadline = window.setTimeout(finish, FOLD_TIMING[phase] + FOLD_TIMING.watchdogSlack);
    return () => { window.clearTimeout(deadline); cancelAnimationFrame(raf); };
  }, [state.phase]);
  useLayoutEffect(() => {
    if (state.phase !== 'reveal' || !root.current) return;
    const el = root.current;
    el.dispatchEvent(new CustomEvent('reader-layout-start', { bubbles: true }));
    // Opacity alone still inserts the new layout in one frame. Open real space
    // first; text stays paused until this entry finishes, then catches up.
    const animations = Array.from(el.children).filter(child => !(child as HTMLElement).hidden && !state.beforeKeys.has((child as HTMLElement).dataset.flowKey!))
      .map(child => child.animate([
        { height: '0px', opacity: 0 },
        { height: `${child.getBoundingClientRect().height}px`, opacity: 1 },
      ], { duration: FOLD_TIMING.reveal, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'both' }));
    return () => {
      animations.forEach(animation => animation.cancel());
      el.dispatchEvent(new CustomEvent('reader-layout-end', { bubbles: true }));
    };
  }, [state.phase]);

  const blocked = state.phase === 'collapse' || state.phase === 'count' || state.phase === 'settle';
  // Two levels of intent. A row's own key wins; the turn-level flag is only the
  // default for rows nobody has touched. Previously the turn flag was ANDed in,
  // so on a closed turn (where it defaults to false) a row could never open on
  // its own and every digest click had to force the whole turn open instead.
  // Restored from 0.1.1, where this was written inline:
  //   !!row.foldKey && (!processOpen || !open[row.foldKey])
  // `processOpen` true means "the turn is allowed to fold"; a row inside a
  // digest then stays hidden until the reader opens that row. Reading it as
  // "open everything" inverted the default and unfolded every digest.
  const isOpen = (key: string): boolean => processOpen && !!open[key];
  const source = state.phase === 'idle' || state.phase === 'collapse' ? state.shown : state.target;
  const rows = state.phase === 'collapse' ? collapseRows(state.shown.items, state.target.items) : flowRows(source.items);
  return <FlowSnapshot.Provider value={source.snapshot}>
    <StreamMotionContext.Provider value={{ ...stream, paused: state.phase !== 'idle', resumed: state.phase === 'reveal' }}>
      <div id={id} ref={root} className={css.choreographedFlow} data-reader-flow data-reader-transition={state.phase} data-ud-motion="fold-choreography">
        {rows.map(row => {
          if (row.kind === 'summary') return <FlowCell key={row.key} rowKey={row.key} hidden={false} instant motion={motion} summary>
            <Summary item={row.item} open={isOpen(row.key)} onChange={value => onOpenChange(row.key, value)} motion={motion && state.phase !== 'collapse'} />
          </FlowCell>;
          const hidden = !!row.foldKey && (!processOpen || !open[row.foldKey]) || (blocked && state.phase !== 'collapse' && !state.beforeKeys.has(row.key));
          // Keep retiring child props unchanged until it has actually shrunk.
          return <FlowCell key={row.key} rowKey={row.key} hidden={hidden} instant={state.phase !== 'idle'} motion={motion}>
            {renderStep(row.step, !!row.foldKey)}
          </FlowCell>;
        })}
      </div>
    </StreamMotionContext.Provider>
  </FlowSnapshot.Provider>;
}
