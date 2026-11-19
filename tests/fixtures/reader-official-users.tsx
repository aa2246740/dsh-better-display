import { Context } from '@deepseek-ai/cordis';
import * as React from 'react';
import * as Primitives from '@deepseek-ai/dsh-client-ui-primitives';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SlotRegistry } from '@fixture/registry';
import { createSlotRenderer } from '@fixture/renderer';
import { Reader } from '../../src/client/Reader.js';
import { createReaderStore } from '../../src/client/store.js';
import { installOfficialSlots, officialChildren, OFFICIAL_SEATS } from '../../src/client/official-slots.js';
import type { ReaderProps } from '../../src/client/types.js';

// Real Reader, registry, scope binding and slot renderer. Only session data is synthetic.
function equal(actual: unknown, expected: unknown) {
  if (!Object.is(actual, expected)) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
}
const assert = {
  equal,
  ok(value: unknown) { equal(Boolean(value), true); },
  deepEqual(actual: unknown, expected: unknown) { equal(JSON.stringify(actual), JSON.stringify(expected)); },
};
async function verify() {
  const root = new Context();
  await root.plugin(SlotRegistry);
  let run = async () => {};
  await root.plugin({ name: 'reader-user-test', inject: ['slots'], async apply(ctx: Context) {
    const slots = ctx.slots as any;
    slots.install(createSlotRenderer());
    const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} });
    const binding = { key: 'session-users', ctx: new Context(), hooks: {}, keyedHooks: {}, props: { sessionId: 'session-users' } };
    slots.installScope('session', {
      current: source(binding), bindingSource: () => source(binding), renderArea: (_: unknown, props: any) => props.children,
    });
    slots.installLocale({ ...source({}), bind: () => (key: string) => key });
    const turn = { turn: 1, status: 'closed', start: { seq: 1, time: 1 },
      end: { time: 2, data: { reason: { kind: 'completed' } } }, data: new Map(), steps: [] };
    const nodes = new Map(['user', 'steering', 'hidden'].map((kind, index) => {
      const key = `${kind}-key`;
      return [key, { key, kind: kind === 'hidden' ? 'user' : kind, anchorSeq: index + 1,
        visibility: kind === 'hidden' ? 'hidden' : 'visible', location: { kind: 'turn', turn },
        data: { seq: index + 1, time: 1, content: [{ type: 'text', text: `${kind} content` }] } }];
    }));
    const chat = { order: [...nodes.keys()], nodes, timeline: { turns: new Map([[1, turn]]) } };
    const session = { running: false, openState: 'ready', pendingSubmissions: [], hasMore: false, loadingOlder: false };
    const store = createReaderStore().create('session-users');
    const props = {
      sessionId: 'session-users', useChat: (select: any) => select(chat),
      useSession: (select: any) => select(session), useSessions: (select: any) => select({ byId: { 'session-users': { cwd: '/fixture' } } }),
      useSessionStatus: (select: any) => select(new Map()), useStore: (select: any) => select(store.getSnapshot()), actions: store.actions,
      t: (key: string) => key, loadImage: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }),
      officialImageLoader: Object.assign(async () => null, { peek: () => null }),
      officialFileMentions: () => undefined, officialPreviewFile: () => {},
      officialHost: source({ home: '/fixture' }), fillComposer: () => true,
      openFile: () => {}, loadOlder: async () => {}, openView: () => {},
    };
    slots.register({ name: 'root', children: {
      'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
      'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: { hooks: {
        turnData: (_: unknown, context: any) => () => context.turnData,
        disclosure: (_: unknown, context: any) => () => context.disclosureReset,
      } } },
      'fixture.reader': { kind: 'single', scope: 'session' },
    } }, ({ SessionProvider, renderSlot }: any) => <SessionProvider>{renderSlot('fixture.reader', {})}</SessionProvider>);
    slots.register({ name: 'fixture.reader', children: { ...officialChildren(slots), 'dsh-better-display.block': { kind: 'chain', scope: 'session' } } }, ({ renderSlot, renderSlotChain }: any) =>
      <Reader {...{ ...props, renderSlot, renderSlotChain } as ReaderProps} />);
    const stopMirror = installOfficialSlots(ctx);
    run = async () => {
      const container = document.getElementById('app')!;
      const reactRoot = createRoot(container);
      const render = () => {
        flushSync(() => reactRoot.render(slots.renderSlot('root', {})));
        return container.innerHTML;
      };
      const count = (html: string, text: string) => html.split(text).length - 1;
      const assertSeats = (html: string) => {
        for (const kind of ['user', 'steering']) {
          assert.equal(count(html, `data-reader-key="${kind}-key"`), 1);
          assert.equal(count(html, `data-chat-anchor-key="${kind}-key"`), 1);
          assert.equal(count(html, `data-chat-flow-key="${kind}-key"`), 1);
          assert.equal(count(html, `data-chat-node-key="${kind}-key"`), 1);
          assert.equal(count(html, `data-chat-flow-kind="${kind}"`), 1);
        }
        assert.equal(count(html, 'data-reader-anchor="true"'), 2);
        assert.ok(!html.includes('hidden content'));
      };

      // The real renderSlot returns an outlet element for an unoccupied key.
      let html = render();
      assertSeats(html);
      assert.equal(count(html, 'user content'), 1);
      assert.equal(count(html, 'steering content'), 1);
      assert.ok(html.includes('补充消息'));
      const seen: any[] = [];
      const official = ({ node, sessionId, injectedSession, useTurnData, useDisclosure }: any) => {
        assert.equal(sessionId, 'session-users');
        assert.equal(injectedSession, 'session-users');
        assert.equal(useTurnData(), turn.data);
        assert.equal(useDisclosure().getSnapshot(), 0);
        assert.equal(node, nodes.get(node.key));
        seen.push(node.kind);
        return <div data-official-user={node.kind}>{node.data.content[0].text}<button>Official recall</button></div>;
      };
      const removeUser = slots.register({ name: 'conversation.chat.node', key: 'user',
        inject: (sessionId: string) => ({ injectedSession: sessionId }), locale: 'chat' }, official);
      const removeSteering = slots.register({ name: 'conversation.chat.node', key: 'steering',
        inject: (sessionId: string) => ({ injectedSession: sessionId }), locale: 'chat' }, official);
      const removeAssistant = slots.register({ name: 'conversation.chat.node', key: 'assistant-step' }, () => <span>Duplicate assistant</span>);
      await new Promise(resolve => queueMicrotask(resolve));
      assert.deepEqual(slots.entriesOfSlot(OFFICIAL_SEATS.nodes).map((entry: any) => entry.options.key).sort(), ['steering', 'user']);
      html = render();
      assertSeats(html);
      assert.equal(count(html, 'Official recall'), 2);
      assert.equal(count(html, 'user content'), 1);
      assert.equal(count(html, 'steering content'), 1);
      assert.deepEqual(seen, ['user', 'steering']);

      // A winner intentionally returning null must keep its row hidden.
      const removeWinner = slots.register({ name: 'conversation.chat.node', key: 'user', priority: -1 }, () => null);
      await new Promise(resolve => queueMicrotask(resolve));
      html = render();
      assertSeats(html);
      assert.equal(count(html, 'user content'), 0);
      assert.equal(count(html, 'Official recall'), 1);
      removeWinner();
      await new Promise(resolve => queueMicrotask(resolve));
      assert.equal(count(render(), 'Official recall'), 2);
      removeUser(); removeSteering(); removeAssistant();
      await new Promise(resolve => queueMicrotask(resolve));
      html = render();
      assertSeats(html);
      assert.equal(count(html, 'user content'), 1);
      assert.equal(count(html, 'steering content'), 1);
      assert.equal(count(html, 'Official recall'), 0);

      // A priority below the official assistant renderer is a replacement.
      // Reader keeps the reasoning card and hands only the body blocks over.
      const assistant = {
        key: 'assistant-key', kind: 'assistant-step', anchorSeq: 4, visibility: 'visible',
        location: { kind: 'turn', turn },
        data: {
          status: 'settled', turn: 1, step: 0, time: 3,
          blocks: [
            { kind: 'reasoning', text: 'think privately' },
            { kind: 'text', text: '<div id="vcp-root">card face</div>' },
          ],
        },
      };
      // Reader memoizes on the order array and the nodes map. A real host
      // publishes new references; this fixture has to do the same.
      chat.nodes = new Map(chat.nodes);
      chat.nodes.set('assistant-key', assistant);
      chat.order = [...chat.order, 'assistant-key'];
      store.actions.setExpanded('turn:1:closed:completed', true);
      html = render();
      assert.equal(count(html, 'data-foreign-assistant'), 0);
      assert.ok(html.includes('vcp-root'));
      assert.ok(html.includes('think privately'));
      const calls: Array<{ groupPart: unknown; kinds: string[]; text: string }> = [];
      const Foreign = (props: { groupPart?: unknown; node?: { data?: { blocks?: Array<{ kind: string; text?: string }> } } }) => {
        const blocks = props.node?.data?.blocks ?? [];
        calls.push({
          groupPart: props.groupPart,
          kinds: blocks.map(block => block.kind),
          text: blocks.map(block => block.text ?? '').join('\n'),
        });
        const body = blocks.filter(block => block.kind === 'text').map(block => block.text ?? '').join('\n');
        return <div data-foreign-assistant>{body}</div>;
      };
      const removeOfficialAssistant = slots.register({ name: 'conversation.chat.node', key: 'assistant-step' }, () => <span>Official assistant</span>);
      const removeForeign = slots.register({ name: 'conversation.chat.node', key: 'assistant-step', priority: -10 }, Foreign);
      await new Promise(resolve => queueMicrotask(resolve));
      assert.ok(slots.entriesOfSlot(OFFICIAL_SEATS.nodes).some((entry: { options: { key?: string; priority?: number } }) => entry.options.key === 'assistant-step' && entry.options.priority === -10));
      html = render();
      const answer = container.querySelector('[data-reader-body]');
      assert.ok(answer);
      assert.equal(answer!.querySelectorAll('[data-foreign-assistant]').length, 1);
      assert.ok(answer!.textContent?.includes('<div id="vcp-root">card face</div>'));
      assert.equal(answer!.querySelectorAll('pre').length, 0);
      assert.equal(count(html, 'Official assistant'), 0);
      assert.ok(calls.some(call => call.groupPart === 'response' && call.kinds.join(',') === 'text' && call.text.includes('vcp-root')));
      assert.ok(calls.every(call => !call.kinds.includes('reasoning')));
      const reasoning = container.querySelector('[data-reader-text-kind="reasoning"]');
      assert.ok(reasoning);
      assert.ok(reasoning!.textContent?.includes('think privately'));
      assert.equal(reasoning!.querySelectorAll('[data-foreign-assistant]').length, 0);
      removeForeign();
      removeOfficialAssistant();
      await new Promise(resolve => queueMicrotask(resolve));
      html = render();
      assert.equal(count(html, 'data-foreign-assistant'), 0);
      assert.ok(html.includes('vcp-root'));
      assert.ok(html.includes('think privately'));
      chat.nodes = new Map(chat.nodes);
      chat.nodes.delete('assistant-key');
      chat.order = chat.order.filter((key: string) => key !== 'assistant-key');
      store.actions.setExpanded('turn:1:closed:completed', false);

      // #88: a closed turn's tail wrapper carries the host anchor
      // data-turn-tail={data.turn}, and the turnTail entries render inside it.
      const tailNode = {
        key: 'tail-key', kind: 'turn-tail', anchorSeq: 5.1, visibility: 'visible',
        location: { kind: 'turn', turn },
        data: { turn: 1, seq: 5, time: 2, closing: null, branchUnavailable: true },
      };
      const removeTail = slots.register({ name: 'conversation.chat.turnTail', id: 'fixture-tail' },
        ({ turn: owner }: { turn: { turn: number } }) => <span data-fixture-tail={owner.turn}>tail for turn {owner.turn}</span>);
      await new Promise(resolve => queueMicrotask(resolve));
      html = render();
      assert.equal(container.querySelectorAll('[data-turn-tail]').length, 0);
      chat.nodes = new Map(chat.nodes);
      chat.nodes.set('tail-key', tailNode);
      chat.order = [...chat.order, 'tail-key'];
      html = render();
      const anchors = container.querySelectorAll('[data-turn-tail]');
      assert.equal(anchors.length, 1);
      assert.equal(anchors[0]!.getAttribute('data-turn-tail'), '1');
      assert.ok(anchors[0]!.hasAttribute('data-reader-official-tail'));
      assert.equal(anchors[0]!.getAttribute('data-actions-reveal'), null);
      assert.ok(anchors[0]!.closest('[data-reader-turn="1"]'));
      const tailEntry = container.querySelector('[data-fixture-tail="1"]');
      assert.ok(tailEntry);
      assert.ok(anchors[0]!.contains(tailEntry));
      // The page-wide lookup a per-turn plugin does finds exactly this row.
      assert.equal(document.querySelector('[data-turn-tail="1"]'), anchors[0]);
      // A turn that is still open has no tail yet, so it has no anchor either.
      turn.status = 'open';
      chat.timeline = { turns: new Map([[1, { ...turn }]]) };
      html = render();
      assert.equal(container.querySelectorAll('[data-turn-tail]').length, 0);
      turn.status = 'closed';
      chat.timeline = { turns: new Map([[1, turn]]) };
      chat.nodes = new Map(chat.nodes);
      chat.nodes.delete('tail-key');
      chat.order = chat.order.filter((key: string) => key !== 'tail-key');
      removeTail();
      await new Promise(resolve => queueMicrotask(resolve));
      html = render();
      assert.equal(container.querySelectorAll('[data-turn-tail]').length, 0);

      const module = Reflect.get(window, 'easyrewriteModule');
      if (module) {
        const plugin = module.factory((name: string) => {
          if (name === 'react') return React;
          if (name === '@deepseek-ai/dsh-client-ui-primitives') return Primitives;
          throw new Error(`Unexpected easyrewrite dependency: ${name}`);
        });
        const disposers: Array<() => void> = [];
        plugin.apply({
          effect: (effect: () => () => void) => disposers.push(effect()),
          slots: {
            inject: (key: string, effect: () => () => void) => key === 'conversation.chat.node' ? effect() : () => {},
            register: (options: object, component: unknown) => slots.register(options, component),
          },
          sessions: { list: source({ current: 'session-users' }), scope: () => ({ get: () => undefined }) },
          workspaces: {},
        });
        await new Promise(resolve => queueMicrotask(resolve));
        html = render();
        assertSeats(html);
        assert.equal(count(html, 'data-dsh-easyrewrite="user"'), 1);
        assert.equal(count(html, 'data-dsh-easyrewrite="recall-key"'), 1);
        assert.equal(count(html, 'user content'), 1);
        assert.equal(count(html, 'steering content'), 1);
        const recall = container.querySelector<HTMLButtonElement>('[data-dsh-easyrewrite="recall-key"]');
        assert.ok(recall);
        flushSync(() => recall!.click());
        assert.equal(container.querySelectorAll('[data-dsh-easyrewrite="confirm-capsule"]').length, 1);
        for (const dispose of disposers) dispose();
      }
      stopMirror();
      reactRoot.unmount();
      Object.assign(window, { readerUserResult: 'passed' });
    };
  } });
  await run();
}
verify().catch(error => { console.error(error); Object.assign(window, { readerUserResult: `${error.stack}\n${document.getElementById('app')?.innerHTML}` }); });
