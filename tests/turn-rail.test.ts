import { deepStrictEqual, strictEqual } from 'node:assert';
import { describe, it } from 'node:test';
import { activeRailTurn, railMarkStyle, railNaturalHeight, turnRailItems } from '../src/client/turn-rail.js';
import type { ReaderGroup } from '../src/client/projection.js';

const group = (key: string, turn: number | null): ReaderGroup => ({ key, turn, keys: [key] });

describe('turn rail projection', () => {
  it('keeps one mark per turn and skips turn-less groups', () => {
    const items = turnRailItems([group('node:a', null), group('turn:3', 3), group('turn:3:late', 3), group('turn:1', 1), group('turn:5', 5)]);
    deepStrictEqual(items.map(item => item.turn), [3, 1, 5]);
    strictEqual(items[0].groupKey, 'turn:3');
  });

  it('derives rail geometry from the native mark rhythm', () => {
    strictEqual(railNaturalHeight(1), 12);
    strictEqual(railNaturalHeight(4), 42);
    strictEqual((railMarkStyle(3) as Record<string, string>)['--turn-natural-position'], '30px');
  });

  it('highlights the last turn at or above the reading line', () => {
    const items = turnRailItems([group('turn:1', 1), group('turn:2', 2), group('turn:4', 4)]);
    strictEqual(activeRailTurn(items, 4), 4);
    strictEqual(activeRailTurn(items, 3), 2);
    strictEqual(activeRailTurn(items, null), 1);
    strictEqual(activeRailTurn([], 2), null);
  });
});
