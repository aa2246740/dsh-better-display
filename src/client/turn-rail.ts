import type { CSSProperties } from 'react';
import type { ReaderGroup } from './projection.js';

/**
 * Turn-navigation rail geometry, ported from the native chat TurnNavigator
 * (packages/client/ui-chat): one mark per session turn, 10px rhythm.
 */
export const RAIL_SPACING_PX = 10;
export const RAIL_INSET_PX = 6;
export const RAIL_FADE_PX = 24;
export const RAIL_MIN_MARKS = 2;

export interface TurnRailItem { turn: number; groupKey: string }

/** One rail mark per loaded turn; a turn split across groups keeps its first seat. */
export function turnRailItems(groups: readonly ReaderGroup[]): TurnRailItem[] {
  const items: TurnRailItem[] = [];
  const seen = new Set<number>();
  for (const group of groups) {
    if (group.turn === null || seen.has(group.turn)) continue;
    seen.add(group.turn);
    items.push({ turn: group.turn, groupKey: group.key });
  }
  return items;
}

/** Height of the marks strip for `markCount` marks at the native rhythm. */
export function railNaturalHeight(markCount: number): number {
  return Math.max(0, (markCount - 1) * RAIL_SPACING_PX + 2 * RAIL_INSET_PX);
}

/** CSS variables consumed by the rail frame; `railScrollTop` keeps previews glued to marks. */
export function railFrameStyle(markCount: number, railScrollTop: number): CSSProperties {
  return {
    '--turn-natural-height': `${railNaturalHeight(markCount)}px`,
    '--turn-rail-inset': `${RAIL_INSET_PX}px`,
    '--turn-scroll-top': `${railScrollTop}px`,
  } as CSSProperties;
}

/** Vertical position variable for the mark at `index` inside the marks strip. */
export function railMarkStyle(index: number): CSSProperties {
  return { '--turn-natural-position': `${index * RAIL_SPACING_PX}px` } as CSSProperties;
}

/** The mark to highlight: the last loaded turn at or above the reading line. */
export function activeRailTurn(items: readonly TurnRailItem[], readingTurn: number | null): number | null {
  if (items.length === 0) return null;
  let next = items[0].turn;
  if (readingTurn === null) return next;
  for (const item of items) {
    if (item.turn > readingTurn) break;
    next = item.turn;
  }
  return next;
}
