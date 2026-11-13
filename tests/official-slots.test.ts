import assert from 'node:assert/strict';
import { test } from 'vitest';
import { memo } from 'react';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { acceptMirroredChatNode, mirrorOfficialSlot, readerTailMatch, type CompositionRegistry } from '../src/client/official-slots.js';

function registry(kind: 'keyed' | 'chain' | 'list' = 'keyed') {
  const core = new SlotCore();
  const register = (options: object, component: unknown) => (core.register as Function)(options, component) as () => void;
  register({ name: 'root', children: {
    source: { kind, scope: 'session' },
    reader: { kind, scope: 'session' },
  } }, () => null);
  const slots: CompositionRegistry = {
    register,
    spec: key => core.spec(key as never),
    entriesOfSlot: key => core.entriesOfSlot(key),
    subscribe: (key, fn) => core.subscribe(key, fn),
    inject: () => { throw new Error('not used by the subtree test'); },
  };
  return { core, slots, register };
}
const changed = () => new Promise(resolve => queueMicrotask(resolve));

test('official present cards retain their data while the existing Reader produced row stays unique', () => {
  const original = Object.freeze({ produced: Object.freeze(['/work/code.ts']), presented: Object.freeze([{ path: '/work/report.pdf', seq: 42 }]), future: 'retained' });
  assert.deepEqual(readerTailMatch(original, ['/work/code.ts']), { produced: [], presented: original.presented, future: 'retained' });
  assert.equal(readerTailMatch(original), original);
  assert.deepEqual(readerTailMatch({ produced: ['/work/code.ts', '/work/new.ts'], presented: [] }, ['/work/code.ts']), { produced: ['/work/new.ts'], presented: [] });
  assert.deepEqual(original.produced, ['/work/code.ts']);
  const future = { artifacts: ['/work/report.pdf'] };
  assert.equal(readerTailMatch(future), future);
});

test('official memo components retain injection, store, locale and selector metadata', () => {
  const { core, slots, register } = registry('chain');
  const component = memo(() => null);
  const inject = () => ({ hooks: { status: { getSnapshot: () => 1, subscribe: () => () => {} } } });
  const select = (owner: unknown) => owner;
  const store = { create: () => ({}) };
  register({ name: 'source', select, inject, store, locale: 'feedback', priority: -7 }, component);
  const before = core.entriesOfSlot('source')[0];
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children');
  const mirrored = core.entriesOfSlot('reader')[0];
  assert.equal(mirrored.component, component);
  assert.equal(mirrored.inject, inject);
  assert.equal(mirrored.select, select);
  assert.equal(mirrored.store, store);
  assert.equal(mirrored.locale, 'feedback');
  assert.equal(mirrored.options.priority, -7);
  assert.equal(core.entriesOfSlot('source')[0], before);
  stop();
  assert.equal(core.entriesOfSlot('reader').length, 0);
  assert.equal(core.entriesOfSlot('source')[0], before);
});

test('nested declarations use distinct seats and are disposed without touching the source', () => {
  const { core, slots, register } = registry();
  const hookContext = { hooks: { turnData: () => () => 'live' } };
  register({ name: 'source', key: 'read-image', children: { images: { kind: 'single', scope: 'session', inject: hookContext } } }, () => null);
  const child = memo(() => null);
  register({ name: 'images', locale: 'images' }, child);
  const before = core.snapshot('source');
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children');
  assert.equal(core.entriesOfSlot('reader.children/images')[0].component, child);
  assert.equal(slots.spec('reader.children/images')?.inject, hookContext);
  assert.deepEqual(core.snapshot('source'), before);
  stop();
  assert.equal(slots.spec('reader.children/images'), undefined);
  assert.equal(core.entriesOfSlot('images')[0].component, child);
});

test('new registrations do not remount existing cards; winner changes and unload reconcile', async () => {
  const { core, slots, register } = registry();
  const first = memo(() => null);
  const second = memo(() => null);
  const fallback = memo(() => null);
  register({ name: 'source', key: 'read' }, first);
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children');
  const originalSeat = core.entriesOfSlot('reader')[0];
  const removeNew = register({ name: 'source', key: 'new-official-tool' }, second);
  await changed();
  assert.equal(core.entriesOfSlot('reader').find(e => e.options.key === 'read'), originalSeat);
  assert.equal(core.entriesOfSlot('reader').length, 2);
  const restore = register({ name: 'source', key: 'read', priority: -1 }, fallback);
  await changed();
  assert.equal(core.entriesOfSlot('reader').find(e => e.options.key === 'read')?.component, fallback);
  restore();
  removeNew();
  await changed();
  assert.equal(core.entriesOfSlot('reader').length, 1);
  assert.equal(core.entriesOfSlot('reader')[0].component, first);
  stop();
  register({ name: 'source', key: 'after-reader-unload' }, second);
  await changed();
  assert.equal(core.entriesOfSlot('reader').length, 0);
});

test('a keyed source component replaced in place is re-mirrored', async () => {
  const { core, slots, register } = registry();
  const official = memo(() => null);
  const decorated = memo(() => null);
  register({ name: 'source', key: 'user' }, official);
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children');
  const sourceEntry = core.entriesOfSlot('source')[0];
  assert.ok(sourceEntry);
  sourceEntry.component = decorated;
  // A decorator that replaces the component in place also nudges the ledger.
  register({ name: 'source', key: 'nudge' }, () => null)();
  await changed();
  assert.equal(core.entriesOfSlot('reader').find(entry => entry.options.key === 'user')?.component, decorated);
  stop();
});

test('a list source component replaced in place keeps the registration-only path', async () => {
  const { core, slots, register } = registry('list');
  const official = memo(() => null);
  const decorated = memo(() => null);
  register({ name: 'source', id: 'row' }, official);
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children');
  const mirrored = core.entriesOfSlot('reader')[0];
  assert.ok(mirrored);
  const sourceEntry = core.entriesOfSlot('source')[0];
  assert.ok(sourceEntry);
  sourceEntry.component = decorated;
  register({ name: 'source', id: 'nudge' }, () => null)();
  await changed();
  assert.equal(core.entriesOfSlot('reader')[0], mirrored);
  assert.equal(mirrored.component, official);
  stop();
});

test('a lower-priority assistant-step replacement is mirrored and the official renderer is not', () => {
  const { core, slots, register } = registry();
  const official = memo(() => null);
  const foreign = memo(() => null);
  const tool = memo(() => null);
  const user = memo(() => null);
  register({ name: 'source', key: 'assistant-step' }, official);
  register({ name: 'source', key: 'assistant-step', priority: -10 }, foreign);
  register({ name: 'source', key: 'tool-call', priority: -10 }, tool);
  register({ name: 'source', key: 'turn-process' }, memo(() => null));
  register({ name: 'source', key: 'user' }, user);
  const winner = core.entriesOfSlot('source').find(entry => entry.options.key === 'assistant-step');
  assert.ok(winner);
  assert.equal(acceptMirroredChatNode(winner), true);
  assert.equal(winner.component, foreign);
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children', acceptMirroredChatNode);
  const mirrored = core.entriesOfSlot('reader');
  assert.deepEqual(mirrored.map(entry => entry.options.key).sort(), ['assistant-step', 'user']);
  assert.equal(mirrored.find(entry => entry.options.key === 'assistant-step')?.component, foreign);
  assert.equal(mirrored.find(entry => entry.options.key === 'assistant-step')?.options.priority, -10);
  assert.equal(mirrored.some(entry => entry.component === official || entry.component === tool), false);
  stop();
  assert.equal(core.entriesOfSlot('reader').length, 0);
  assert.equal(core.entriesOfSlot('source').find(entry => entry.options.key === 'assistant-step')?.component, foreign);
});

test('the official assistant-step priority stays on the source slot', () => {
  const { core, slots, register } = registry();
  const official = memo(() => null);
  register({ name: 'source', key: 'assistant-step', priority: 0 }, official);
  const entry = core.entriesOfSlot('source')[0];
  assert.ok(entry);
  assert.equal(acceptMirroredChatNode(entry), false);
  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.children', acceptMirroredChatNode);
  assert.equal(core.entriesOfSlot('reader').length, 0);
  assert.equal(core.entriesOfSlot('source')[0]?.component, official);
  stop();
});

test('partial setup rolls back its own registrations on a nested contract failure', () => {
  const { core, slots, register } = registry();
  register({ name: 'source', key: 'nested', children: { detail: { kind: 'single', scope: 'session' } } }, () => null);
  register({ name: 'detail' }, () => null);
  const failing = { ...slots, register(options: Parameters<CompositionRegistry['register']>[0], component: unknown) {
    if (options.name === 'reader.children/detail') throw new Error('fixture failure');
    return slots.register(options, component);
  } };
  assert.throws(() => mirrorOfficialSlot(failing, 'source', 'reader', 'reader.children'), /fixture failure/);
  assert.equal(core.entriesOfSlot('reader').length, 0);
  assert.equal(slots.spec('reader.children/detail'), undefined);
  assert.equal(core.entriesOfSlot('source').length, 1);
  assert.equal(core.entriesOfSlot('detail').length, 1);
});
