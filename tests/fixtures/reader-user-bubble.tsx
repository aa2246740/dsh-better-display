import { Context } from '@deepseek-ai/cordis';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { SlotRegistry } from '@fixture/registry';
import { createSlotRenderer } from '@fixture/renderer';
import { UserMessageNodeView } from '@fixture/user-message';
import { UserContent } from '@fixture/user-content';
import { Reader } from '../../src/client/Reader.js';
import { createReaderStore } from '../../src/client/store.js';
import { OFFICIAL_SEATS, OFFICIAL_SLOTS, installOfficialSlots, officialChildren } from '../../src/client/official-slots.js';
import type { ReaderProps } from '../../src/client/types.js';

// Real Reader, real slot seats, and the host's user/steering renderer.
// Session text is the only synthetic part. Width is measured after layout.

const CASES = [
  { name: 'short', width: 748, axis: '', text: '升级插件' },
  { name: 'thirty', width: 748, axis: '', text: '测'.repeat(30) },
  { name: 'long', width: 748, axis: '', text: '测'.repeat(80) },
  { name: 'narrow', width: 480, axis: '', text: '测'.repeat(30) },
  { name: 'wide-axis', width: 1000, axis: '1000px', text: '测'.repeat(80) },
] as const;

function turnOf() {
  return {
    turn: 1, status: 'closed' as const, start: { seq: 1, time: 1 },
    end: { time: 2, data: { reason: { kind: 'completed' } } }, data: new Map(), steps: [],
  };
}

function messageNode(kind: 'user' | 'steering', text: string) {
  const turn = turnOf();
  return {
    key: `${kind}-key`, kind, anchorSeq: kind === 'user' ? 1 : 2, visibility: 'visible' as const,
    location: { kind: 'turn' as const, turn },
    data: { seq: kind === 'user' ? 1 : 2, time: 1, content: [{ type: 'text', text }] },
  };
}

function readerProps(text: string, renderSlot: ReaderProps['renderSlot'], renderSlotChain: ReaderProps['renderSlotChain']): ReaderProps {
  const turn = turnOf();
  const user = messageNode('user', text);
  const steering = messageNode('steering', text);
  user.location = { kind: 'turn', turn };
  steering.location = { kind: 'turn', turn };
  const nodes = new Map([[user.key, user], [steering.key, steering]]);
  const chat = { order: [user.key, steering.key], nodes, timeline: { turns: new Map([[1, turn]]) } };
  const session = {
    running: false, openState: 'ready', hasMore: false, loadingOlder: false,
    pendingSubmissions: [{ requestId: `pending-${text.length}`, text, time: 1, placement: 'transcript' }],
  };
  const store = createReaderStore().create(`session-${text.length}`);
  store.actions.setMotion(false);
  const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} });
  return {
    sessionId: `session-${text.length}`,
    useChat: (select: (snapshot: typeof chat) => unknown) => select(chat),
    useSession: (select: (snapshot: typeof session) => unknown) => select(session),
    useSessions: (select: (snapshot: { byId: Record<string, { cwd: string }> }) => unknown) => select({ byId: { [`session-${text.length}`]: { cwd: '/fixture' } } }),
    useSessionStatus: (select: (snapshot: Map<string, unknown>) => unknown) => select(new Map()),
    useStore: (select: (snapshot: ReturnType<typeof store.getSnapshot>) => unknown) => select(store.getSnapshot()),
    actions: store.actions,
    t: (key: string) => key,
    loadImage: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }),
    officialImageLoader: Object.assign(async () => null, { peek: () => null }),
    officialFileMentions: () => undefined,
    officialPreviewFile: () => {},
    officialHost: source({ home: '/fixture' }),
    fillComposer: () => true,
    openFile: () => {},
    loadOlder: async () => {},
    openView: () => {},
    renderSlot,
    renderSlotChain,
  } as ReaderProps;
}

function NativeColumn({ renderSlot, kind, text }: {
  renderSlot: ReaderProps['renderSlot'];
  kind: 'user' | 'steering';
  text: string;
}) {
  const node = messageNode(kind, text);
  const owner = {
    cwd: '/fixture', openFile: () => {}, forkAt: () => {},
    inspectCall: () => {}, loadImage: async () => null,
    fileMentions: () => undefined, node,
  };
  return (
    <div data-native={kind} style={{ width: '100%', maxWidth: 'var(--dsh-chat-content-width, 748px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ minWidth: 0 }}>
        {renderSlot(OFFICIAL_SLOTS.nodes, owner, {
          entryKey: kind,
          hookContext: {
            turnData: node.location.turn.data,
            disclosureReset: { getSnapshot: () => 0, subscribe: () => () => {}, set: () => {} },
            useGroupAction: () => ({ current: null }),
          },
          fallback: null,
        })}
      </div>
    </div>
  );
}

function paddedTextBox(scope: ParentNode | null): Element | null {
  if (!scope) return null;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!node.textContent?.trim()) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest('button')) continue;
    let element: HTMLElement | null = parent;
    while (element && element !== scope) {
      if (parseFloat(getComputedStyle(element).paddingTop) > 0) return element;
      element = element.parentElement;
    }
    return parent;
  }
  return null;
}

function boxOf(root: ParentNode | null, kind: 'user' | 'steering' | 'pending') {
  const scope = kind === 'pending'
    ? root?.querySelector('[data-reader-pending-submission]')
    : root?.querySelector(`[data-reader-key="${kind}-key"]`);
  return paddedTextBox(scope ?? null);
}

function nativeBox(frame: ParentNode, kind: 'user' | 'steering') {
  return paddedTextBox(frame.querySelector(`[data-native="${kind}"]`));
}

function measure(element: Element | null) {
  if (!element) return { w: 0, h: 0, font: '', line: '' };
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return {
    w: Math.round(rect.width * 10) / 10,
    h: Math.round(rect.height * 10) / 10,
    font: style.fontSize,
    line: style.lineHeight,
  };
}

async function verify() {
  const root = new Context();
  await root.plugin(SlotRegistry);
  let run = async () => {};
  await root.plugin({ name: 'reader-bubble-width', inject: ['slots'], async apply(ctx: Context) {
    const slots = ctx.slots as any;
    slots.install(createSlotRenderer());
    const source = <T,>(value: T) => ({ getSnapshot: () => value, subscribe: () => () => {} });
    const binding = { key: 'session-width', ctx: new Context(), hooks: {}, keyedHooks: {}, props: { sessionId: 'session-width' } };
    slots.installScope('session', {
      current: source(binding), bindingSource: () => source(binding), renderArea: (_: unknown, props: { children?: unknown }) => props.children,
    });
    slots.installLocale({ ...source({}), bind: () => (key: string) => key });
    const HostUser = (props: Record<string, unknown>) => (
      <UserMessageNodeView
        {...props as never}
        t={(props.t as ((key: string) => string) | undefined) ?? ((key: string) => key)}
        openFile={(props.openFile as (() => void) | undefined) ?? (() => {})}
      />
    );
    slots.register({ name: 'root', children: {
      'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: { hooks: {
        turnData: (_: unknown, context: { turnData?: unknown }) => () => context.turnData,
        disclosure: (_: unknown, context: { disclosureReset?: { getSnapshot(): number } }) => () => context.disclosureReset,
        groupAction: (_: unknown, context: { useGroupAction?: unknown }) => context.useGroupAction,
      } } },
      'conversation.chat.message.images': { kind: 'single', scope: 'session' },
      'fixture.reader': { kind: 'single', scope: 'session' },
    } }, ({ SessionProvider, renderSlot }: any) => (
      <SessionProvider>
        {renderSlot('fixture.reader', {})}
        {CASES.map(item => (
          <section key={`native-${item.name}`} data-native-case={item.name} style={{ width: item.width, ['--dsh-chat-content-width' as string]: item.axis || undefined }}>
            <NativeColumn renderSlot={renderSlot} kind="user" text={item.text} />
            <NativeColumn renderSlot={renderSlot} kind="steering" text={item.text} />
          </section>
        ))}
      </SessionProvider>
    ));
    slots.register({ name: 'fixture.reader', children: {
      ...officialChildren(slots),
      'dsh-better-display.block': { kind: 'chain', scope: 'session' },
    } }, ({ renderSlot, renderSlotChain }: any) => (
      <>
        {CASES.map(item => (
          <section key={item.name} data-case={item.name} style={{ width: item.width, ['--dsh-chat-content-width' as string]: item.axis || undefined }}>
            <div data-reader-mount>
              <Reader {...readerProps(item.text, renderSlot, renderSlotChain)} />
            </div>
          </section>
        ))}
      </>
    ));
    slots.registerFactory({
      name: 'conversation.chat.user.content', scope: 'session', locale: 'chat',
      children: { 'conversation.chat.user.images': { kind: 'single', scope: 'session' } },
    }, UserContent);
    slots.registerFactory({
      name: 'conversation.user.text', scope: 'session', locale: 'chat',
    }, ({ text }: { text: string }) => <>{text}</>);
    slots.register({ name: 'conversation.chat.node', key: 'user', locale: 'chat' }, HostUser);
    slots.register({ name: 'conversation.chat.node', key: 'steering', locale: 'chat' }, HostUser);
    const stopMirror = installOfficialSlots(ctx);
    run = async () => {
      await new Promise(resolve => queueMicrotask(resolve));
      const container = document.getElementById('app')!;
      const reactRoot = createRoot(container);
      flushSync(() => reactRoot.render(slots.renderSlot('root', {})));
      for (const reader of container.querySelectorAll<HTMLElement>('[data-dsh-better-display]')) reader.style.padding = '0';
      await new Promise(resolve => requestAnimationFrame(() => resolve(undefined)));
      const readerSlot = container.querySelector('[data-reader-key="user-key"] [data-slot]')?.getAttribute('data-slot') ?? '';
      const nativeSlot = container.querySelector('[data-native="user"] [data-slot]')?.getAttribute('data-slot') ?? '';
      const rows = CASES.map(item => {
        const frame = container.querySelector(`[data-case="${item.name}"]`);
        const nativeFrame = container.querySelector(`[data-native-case="${item.name}"]`);
        const mount = frame?.querySelector('[data-reader-mount]') ?? null;
        const user = measure(boxOf(mount, 'user'));
        const steering = measure(boxOf(mount, 'steering'));
        const pending = measure(boxOf(mount, 'pending'));
        const nativeUser = measure(nativeFrame ? nativeBox(nativeFrame, 'user') : null);
        const nativeSteering = measure(nativeFrame ? nativeBox(nativeFrame, 'steering') : null);
        return {
          name: item.name,
          user, steering, pending, nativeUser, nativeSteering,
          readerHtml: mount?.querySelector('[data-reader-key="user-key"]')?.innerHTML.slice(0, 400) ?? '',
        };
      });
      stopMirror();
      Object.assign(window, { readerBubbleResult: { readerSlot, nativeSlot, expectedReaderSlot: OFFICIAL_SEATS.nodes, expectedNativeSlot: OFFICIAL_SLOTS.nodes, rows } });
    };
  } });
  await run();
}

verify().catch(error => {
  console.error(error);
  Object.assign(window, { readerBubbleResult: { error: `${error instanceof Error ? error.stack : String(error)}\n${document.getElementById('app')?.innerHTML.slice(0, 2000)}` } });
});
