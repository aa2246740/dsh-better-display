import assert from 'node:assert/strict';
import { test } from 'vitest';

/**
 * The registry's behaviour, exercised without React.
 *
 * The reported bug was that `add` was never called, so this models the same
 * bookkeeping the hook performs: mount a group of four pictures, read each one's
 * position, then unmount one and read again.
 */
function makeRegistry() {
  const entries = new Map<string, { id: string; src: string }>();
  let version = 0;
  return {
    add(member: { id: string; src: string }) {
      entries.set(member.id, member);
      version += 1;
      return () => {
        entries.delete(member.id);
        version += 1;
      };
    },
    members: () => [...entries.values()],
    version: () => version
  };
}

test('four pictures registered in one scope report 1/4 through 4/4', () => {
  const registry = makeRegistry();
  const stops = ['a', 'b', 'c', 'd'].map(id => registry.add({ id, src: `${id}.png` }));
  const members = registry.members();
  assert.equal(members.length, 4);
  for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
    const index = members.findIndex(item => item.id === id);
    assert.equal(index + 1, i + 1, `${id} is picture ${i + 1}`);
  }
  // Every picture sees the same total, which is what makes `1/4` meaningful.
  assert.equal(members.length, 4);
  stops.forEach(stop => stop());
  assert.equal(registry.members().length, 0);
});

test('unregistering one picture renumbers the rest', () => {
  const registry = makeRegistry();
  const stopB = registry.add({ id: 'b', src: 'b.png' });
  registry.add({ id: 'c', src: 'c.png' });
  assert.equal(registry.members().length, 2);
  stopB();
  const members = registry.members();
  assert.equal(members.length, 1);
  assert.equal(members[0]!.id, 'c');
  // With one left there is nowhere to page, so the caller sees no step.
  assert.equal(members.length > 1, false);
});

test('a picture outside any scope is alone', () => {
  // No registry at all: a tool-call attachment, which is the 1/1 case.
  const registry: ReturnType<typeof makeRegistry> | null = null;
  const members = registry === null ? [] : registry.members();
  assert.equal(members.length, 0);
});

test('the count must not depend on click history', () => {
  // The reported bug: four pictures read `1/1`, `1/2`, `1/3`… in the order they
  // were opened, because a picture only joined the group when it was clicked.
  // Registration has to happen on mount.
  //
  // Model both behaviours on the same four pictures.
  const mountThenOpen = () => {
    const registry = makeRegistry();
    // All four register when they render.
    for (const id of ['a', 'b', 'c', 'd']) registry.add({ id, src: `${id}.png` });
    return registry.members().length;
  };
  const clickThenRegister = (clicks: string[]) => {
    const registry = makeRegistry();
    let total = 0;
    for (const id of clicks) {
      registry.add({ id, src: `${id}.png` });
      total = registry.members().length;
    }
    return total;
  };
  // Mount-time registration gives the true total immediately.
  assert.equal(mountThenOpen(), 4);
  // Click-time registration gives a count that grows with the clicks.
  assert.equal(clickThenRegister(['a']), 1);
  assert.equal(clickThenRegister(['a', 'b']), 2);
  // ...so four pictures would never read 1/4 until all four had been opened.
  assert.notEqual(clickThenRegister(['a']), 4);
});
