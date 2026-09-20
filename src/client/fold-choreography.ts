import type { LiveStep, LiveTurnItem } from './live-turn.js';

/** Presentation clock, not model/network time. */
export const FOLD_TIMING = {
  collapse: 320,
  count: 160,
  settle: 80,
  reveal: 180,
  /**
   * Slack added to every phase deadline before the watchdog forces the next phase.
   *
   * The choreography advances on animation promises and rendered frames. Both are
   * best-effort: a cancelled animation *rejects* and a compositor that never
   * finishes one leaves its promise pending, while a backgrounded tab stops
   * delivering frames. Without a deadline the machine would sit in a non-idle
   * phase forever, and a non-idle phase freezes both the frame source and the text
   * reveal, so the turn would look stuck until a remount. This is the liveness
   * guarantee that does not depend on any of them.
   */
  watchdogSlack: 240,
} as const;
export type FoldPhase = 'idle' | 'collapse' | 'count' | 'settle' | 'reveal';
export type FlowRow =
  | { kind: 'summary'; key: string; item: Extract<LiveTurnItem, { kind: 'fold' }> }
  | { kind: 'step'; key: string; step: LiveStep; foldKey?: string };

/** A step always has the same parent and React key, even when its membership changes. */
export function flowRows(items: readonly LiveTurnItem[]): FlowRow[] {
  return items.flatMap((item): FlowRow[] => item.kind === 'fold'
    ? [{ kind: 'summary', key: item.key, item }, ...item.steps.map(step => ({ kind: 'step' as const, key: step.key, step, foldKey: item.key }))]
    : [{ kind: 'step', key: item.key, step: item.step }]);
}

export function retiringKeys(before: readonly LiveTurnItem[], after: readonly LiveTurnItem[], open: Readonly<Record<string, boolean>>, processOpen = false): string[] {
  const folded = new Set(flowRows(after).filter(row => row.kind === 'step' && row.foldKey && !(open[row.foldKey] ?? processOpen)).map(row => row.key));
  return flowRows(before).filter(row => row.kind === 'step' && !row.foldKey && folded.has(row.key)).map(row => row.key);
}

/** Insert only new summary slots. Never admit incoming content during shrink. */
export function collapseRows(before: readonly LiveTurnItem[], target: readonly LiveTurnItem[]): FlowRow[] {
  const rows = flowRows(before);
  const headers = new Set(rows.filter(row => row.kind === 'summary').map(row => row.key));
  for (const item of target) {
    if (item.kind !== 'fold' || headers.has(item.key)) continue;
    const members = new Set(item.steps.map(step => step.key));
    const at = rows.findIndex(row => members.has(row.key));
    if (at >= 0) rows.splice(at, 0, { kind: 'summary', key: item.key, item: { ...item, summary: item.summary.replace(/\d+/g, '0') } });
  }
  return rows;
}

export function containsNewUser(before: readonly LiveTurnItem[], after: readonly LiveTurnItem[]): boolean {
  const users = new Set(before.filter(item => item.kind === 'user').map(item => item.key));
  return after.some(item => item.kind === 'user' && !users.has(item.key));
}
