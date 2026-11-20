/**
 * Harness 0.2.2 contract points that the Reader adapter depends on.
 * Each test names the upstream change it pins.
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { memo } from 'react';
import { SlotCore } from '@deepseek-ai/dsh-client-ui-slots';
import { mirrorOfficialSlot, type CompositionRegistry } from '../src/client/official-slots.js';
import { chatNodeOwner } from '../src/client/chat-node-owner.js';

function registry() {
  const core = new SlotCore();
  const register = (options: object, component: unknown) =>
    (core.register as Function)(options, component) as () => void;
  register(
    {
      name: 'root',
      children: {
        source: { kind: 'keyed', scope: 'session' },
        reader: { kind: 'keyed', scope: 'session' }
      }
    },
    () => null
  );
  const slots: CompositionRegistry = {
    register,
    spec: key => core.spec(key as never),
    entriesOfSlot: key => core.entriesOfSlot(key),
    subscribe: (key, fn) => core.subscribe(key, fn),
    inject: () => {
      throw new Error('not used by the subtree test');
    }
  };
  return { core, slots, register };
}

// ui-chat 0.2.2: the `user` registration declares the `conversation.chat.user.before`
// chain seat; `steering` shares the component and injects a null renderSlotChain.
test('user.before chain seat is mirrored with its selectors, and steering keeps its inject', () => {
  const { core, slots, register } = registry();
  const UserView = memo(() => null);
  const steeringInject = () => ({ renderSlotChain: () => null });
  register(
    {
      name: 'source',
      key: 'user',
      children: { 'conversation.chat.user.before': { kind: 'chain', scope: 'session' } }
    },
    UserView
  );
  register({ name: 'source', key: 'steering', inject: steeringInject }, UserView);
  const select = (owner: { kind: string }) =>
    owner.kind === 'user' ? { label: 'telegram' } : null;
  const Badge = () => null;
  register({ name: 'conversation.chat.user.before', select, priority: -1 }, Badge);

  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.nodes');
  const user = core.entriesOfSlot('reader').find(entry => entry.options.key === 'user');
  const steering = core.entriesOfSlot('reader').find(entry => entry.options.key === 'steering');
  assert.ok(user && steering);
  assert.deepEqual(Object.keys(user.children ?? {}), [
    'reader.nodes/conversation.chat.user.before'
  ]);
  assert.equal(user.children!['reader.nodes/conversation.chat.user.before']!.kind, 'chain');
  // Steering declares no child seat, so its component is the official one, inject intact.
  assert.equal(steering.component, UserView);
  assert.equal(steering.inject, steeringInject);

  const seat = core.entriesOfSlot('reader.nodes/conversation.chat.user.before');
  assert.equal(seat.length, 1);
  assert.equal(seat[0]!.component, Badge);
  assert.equal(seat[0]!.select, select);
  assert.equal(seat[0]!.options.priority, -1);

  stop();
  assert.equal(core.entriesOfSlot('reader').length, 0);
  assert.equal(core.entriesOfSlot('conversation.chat.user.before').length, 1);
});

// ui-slots 0.2.2 adds the `hoc` kind. A mirrored entry that declares a hoc child
// keeps each layer's id, dispatch key and nesting order.
test('a hoc child seat mirrors layer id, key and order', () => {
  const { core, slots, register } = registry();
  register(
    { name: 'source', key: 'command', children: { fence: { kind: 'hoc', scope: 'session' } } },
    memo(() => null)
  );
  const Outer = () => null;
  const Diff = () => null;
  register({ name: 'fence', id: 'frame', order: -1 }, Outer);
  register({ name: 'fence', id: 'rows', key: 'diff', order: 2 }, Diff);

  const stop = mirrorOfficialSlot(slots, 'source', 'reader', 'reader.nodes');
  const layers = core.entriesOfSlot('reader.nodes/fence');
  assert.deepEqual(
    layers.map(entry => [
      entry.component,
      entry.options.id,
      entry.options.key,
      entry.options.order
    ]),
    [
      [Outer, 'frame', undefined, -1],
      [Diff, 'rows', 'diff', 2]
    ]
  );
  stop();
  assert.equal(core.entriesOfSlot('reader.nodes/fence').length, 0);
});

// ui-chat 0.2.2 removed `fileMentions` from ChatNodeOwnerProps; the assistant-step
// registration injects its own. Owner props spread after injected props, so the
// Reader owner must not carry that key.
test('chat node owner carries exactly the 0.2.2 owner fields', () => {
  const opened: string[] = [];
  const loadImage = Object.assign(async () => ({ url: 'blob:x' }), { peek: () => undefined });
  const owner = chatNodeOwner({ cwd: '/work' }, {
    openView: (view: string, callId?: string) => {
      opened.push(`${view}:${callId}`);
    },
    officialImageLoader: loadImage
  } as never);
  assert.deepEqual(Object.keys(owner).sort(), [
    'cwd',
    'forkAt',
    'inspectCall',
    'loadImage',
    'openFile'
  ]);
  assert.equal('fileMentions' in owner, false);
  assert.equal(owner.cwd, '/work');
  assert.equal(owner.loadImage, loadImage);
  owner.inspectCall('call-1');
  assert.deepEqual(opened, ['trajectory:call-1']);
});
