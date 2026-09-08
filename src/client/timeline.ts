import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';

export interface TimelineItem {
  readonly turn: number;
  readonly prompt: string;
  readonly response: string;
  readonly hasDeliverables: boolean;
  readonly anchor:
    | { readonly kind: 'loaded'; readonly key: string }
    | { readonly kind: 'unloaded'; readonly seq: number };
}

interface RawOutlineEntry {
  readonly turn?: unknown;
  readonly seq?: unknown;
  readonly prompt?: unknown;
  readonly response?: unknown;
}

interface LoadedTurnNavigationItem {
  readonly turn: number;
  readonly anchorKey: string;
  readonly prompt: string;
  readonly response: string;
}

/**
 * Merge host turn outline with loaded navigation items and turn deliverables.
 * Guarantees strictly ascending turn order and dedupes entries.
 */
export function mergeTimelineItems(
  loaded: readonly LoadedTurnNavigationItem[] | undefined,
  outline: unknown,
  turnsWithDeliverables?: ReadonlySet<number>,
): readonly TimelineItem[] {
  const byTurn = new Map<number, TimelineItem>();

  // 1. Process host whole-log outline (if available)
  if (Array.isArray(outline)) {
    for (const raw of outline) {
      if (typeof raw !== 'object' || raw === null) continue;
      const entry = raw as RawOutlineEntry;
      if (typeof entry.turn !== 'number' || !Number.isSafeInteger(entry.turn) || entry.turn < 0) continue;
      if (typeof entry.seq !== 'number' || !Number.isSafeInteger(entry.seq) || entry.seq < 0) continue;

      byTurn.set(entry.turn, {
        turn: entry.turn,
        prompt: typeof entry.prompt === 'string' ? entry.prompt.trim() : '',
        response: typeof entry.response === 'string' ? entry.response.trim() : '',
        hasDeliverables: turnsWithDeliverables?.has(entry.turn) ?? false,
        anchor: { kind: 'unloaded', seq: entry.seq },
      });
    }
  }

  // 2. Overlay loaded items (taking loaded anchor, preferring freshest previews)
  if (Array.isArray(loaded)) {
    for (const item of loaded) {
      if (typeof item.turn !== 'number') continue;
      const preview = byTurn.get(item.turn);
      const prompt = item.prompt?.trim() || preview?.prompt || '';
      const response = item.response?.trim() || preview?.response || '';
      const hasDeliverables = turnsWithDeliverables?.has(item.turn) ?? preview?.hasDeliverables ?? false;

      byTurn.set(item.turn, {
        turn: item.turn,
        prompt,
        response,
        hasDeliverables,
        anchor: { kind: 'loaded', key: item.anchorKey },
      });
    }
  }

  if (byTurn.size === 0) return [];
  return [...byTurn.values()].sort((a, b) => a.turn - b.turn);
}
