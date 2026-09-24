/** Test-only imports resolve to the selected Harness; none enter client.js. */
import { Context } from '@deepseek-ai/cordis';
import { createRoot } from 'react-dom/client';
import { memo, useState } from 'react';
import { SlotRegistry } from '@fixture/registry';
import { createSlotRenderer } from '@fixture/renderer';
import { apply as applyFeedback } from '@fixture/feedback';
import { ReadRow } from '@fixture/read-row';
import { readImageToolview } from '@fixture/read-image-row';
import { en as conversationEn } from '@fixture/tool-locale';
import { officialChildren, installOfficialSlots, OFFICIAL_SEATS } from '../src/client/official-slots.js';
import { OfficialActions, OfficialTool } from '../src/client/OfficialContent.js';
import { Deliverables } from '@fixture/deliverables';
import { zh as deliverablesZh, en as deliverablesEn } from '@fixture/deliverables-locale';
import { CopyAnswer } from '../src/client/Blocks.js';
import { MotionMarkdown } from '../src/client/word-motion.js';
import css from '../src/client/Reader.module.css';

const rootContext = new Context();
await rootContext.plugin(SlotRegistry);
await rootContext.plugin({ name: 'bridge-fixture', inject: ['slots'], async apply(ctx: Context) {
const slots = ctx.slots as any;
slots.install(createSlotRenderer());
const observations: any = { opens: [], requests: [], mounts: 0, subscriptions: 0 };
const source = <T,>(initial: T) => {
  let value = initial;
  const listeners = new Set<() => void>();
  return { getSnapshot: () => value, subscribe: (fn: () => void) => {
    listeners.add(fn); observations.subscriptions++;
    return () => { if (listeners.delete(fn)) observations.subscriptions--; };
  }, set(next: T) { value = next; for (const fn of [...listeners]) fn(); } };
};
const localeSource = source({ revision: 0 });
let language = 'zh';
const dictionaries: Record<string, any> = { deliverables: { zh: deliverablesZh, en: deliverablesEn }, conversation: { zh: conversationEn, en: conversationEn } };
const locale = {
  ...localeSource,
  register(ns: string, dictionary: any) { dictionaries[ns] = dictionary; return () => { delete dictionaries[ns]; }; },
  bind(ns: string) { return (key: string, values?: Record<string, any>) => {
    let text = dictionaries[ns]?.[language]?.[key] ?? dictionaries[ns]?.en?.[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) text = text.replaceAll(`{${name}}`, String(value));
    return text;
  }; },
};
ctx.provide('locale', locale);
slots.installLocale(locale);
const messageItems = new Map();
ctx.provide('remote', {
  messageFeedback: {
    async list(request: any) { observations.requests.push(['list', request]); return { ok: true, value: { ok: true, value: { items: [...messageItems.values()] } } }; },
    async put(request: any) {
      observations.requests.push(['put', request]);
      const item = { messageId: request.messageId, rating: request.rating, version: (messageItems.get(request.messageId)?.version ?? 0) + 1, ...request.entry };
      messageItems.set(request.messageId, item);
      return { ok: true, value: { ok: true, value: item } };
    },
    async delete(request: any) { observations.requests.push(['delete', request]); messageItems.delete(request.messageId); return { ok: true, value: { ok: true, value: { item: null } } }; },
  },
  sessionFeedback: { record: async () => { throw new Error('Unexpected session feedback'); } },
});
const binding = { key: 'session-a', ctx: new Context(), hooks: {}, keyedHooks: {}, props: { sessionId: 'session-a' } };
const current = source(binding);
slots.installScope('session', { current, resolve: (id: string) => id === binding.key ? binding : undefined, renderArea: (_b: any, props: any) => props.children });
const toolBlock = {
  kind: 'tool-result', callId: 'read-1', call: { name: 'read', args: { file_path: '/fixture/sample.ts', offset: 12 }, argsRaw: '{"file_path":"/fixture/sample.ts","offset":12}' },
  content: [{ type: 'text', text: '<path>/fixture/sample.ts</path>\n<type>file</type>\n<content>\n12: export const value = 1;\n</content>' }], isError: false, subCalls: [], time: 100, callTime: 10,
  meta: { path: '/fixture/sample.ts', offset: 12, totalLines: 20, lines: [{ number: 12, text: 'export const value = 1;' }], lang: 'typescript' },
};
const host = source({ home: '/fixture' });
const loadImage = Object.assign(async () => '/pixel.png', { peek: () => '/pixel.png' });
const blockProps = { loadImage: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }), fillComposer: () => true, cwd: '/fixture', openFile: (path: string, options?: any) => observations.opens.push({ path, options }) };
let stopReader = () => {};
let stopMirror = () => {};
slots.register({ name: 'root', children: {
  'conversation.chat.assistant-actions': { kind: 'list', scope: 'session' },
  'tool.call.toolview': { kind: 'keyed', scope: 'session' },
  'conversation.chat.turnTail': { kind: 'list', scope: 'session' },
  'conversation.chat.node': { kind: 'keyed', scope: 'session', inject: { hooks: { turnData: (_s: any, value: any) => () => value } } },
  'conversation.message.images': { kind: 'single', scope: 'session' },
  'conversation.input.overlay': { kind: 'list', scope: 'session' },
  'fixture.reader': { kind: 'single', scope: 'session' },
} }, ({ SessionProvider, renderSlot }: any) => <SessionProvider>
  {renderSlot('fixture.reader', {}, { fallback: <div data-unmounted>Reader unloaded</div> })}
  {renderSlot('conversation.input.overlay', {})}
</SessionProvider>);
await ctx.plugin({ name: 'fixture-official-feedback', inject: ['slots', 'remote', 'locale'], apply: applyFeedback });
slots.register({ name: 'tool.call.toolview', key: 'read', locale: 'conversation' }, ReadRow);
readImageToolview.apply(ctx);
slots.provideRoot({ hooks: { sessions: source({ byId: { 'session-a': { cwd: '/fixture' } } }) } });
const artifact = { path: '/fixture/report.pdf', description: '演示报告', seq: 42, index: 0 };
const presentedOpen = source({});
const presentedHost = source({ available: true, fileManager: 'finder' });
slots.register({ name: 'conversation.chat.turnTail', locale: 'deliverables',
  select: () => ({ produced: ['/fixture/sample.ts'], presented: [artifact] }),
  inject: () => ({ hooks: { presentedOpen, presentedHost }, reloadPresentedHost: async () => {},
    openPresented: async (...args: any[]) => { observations.opens.push(['presented', ...args]); },
  }),
}, Deliverables);
let liveDetail = source('initial');
const storeHandle = { create: () => {
  observations.mounts++;
  const value = source(0);
  return { ...value, actions: { increment: () => value.set(value.getSnapshot() + 1) }, clearPersisted() {} };
} };
slots.register({ name: 'conversation.chat.node', key: 'future-widget', store: storeHandle,
  children: { 'future.detail': { kind: 'single', scope: 'session' } },
  inject: (sessionId: string, actions: any) => ({ hooks: { detail: liveDetail }, injectedSession: sessionId, increment: actions.increment }),
}, memo(function FutureWidget({ useStore, useDetail, useTurnData, injectedSession, increment, renderSlot }: any) {
  const value = useStore((n: number) => n);
  const detail = useDetail((s: string) => s);
  const context = useTurnData();
  return <div data-memo-widget><button onClick={increment}>Count {value}</button><span>{injectedSession} / {detail} / {context}</span>{renderSlot('future.detail', {})}</div>;
}));
slots.register({ name: 'future.detail' }, memo(() => <span data-nested>nested official child</span>));

function ReaderFixture({ renderSlot, renderSlotChain }: any) {
  const official = { renderSlot, renderSlotChain, officialHost: host, officialImageLoader: loadImage, officialFileMentions: () => undefined, officialPreviewFile: blockProps.openFile, openView: (...args: any[]) => observations.opens.push(args) };
  const [text, setText] = useState('本地图片：\n\n![本地样例](/fixture/image.png)\n\n普通正文 **加粗** 与 `sample.ts`。');
  return <main className={css.root} data-dsh-better-display="official-fixture"><div className={css.column} data-chat-flow="">
    <article className={css.answer} data-reader-answer>
      <MotionMarkdown text={text} streaming={false} enabled={false} revision={0} />
      <CopyAnswer blocks={[{ kind: 'text', text }]} extraActions={<OfficialActions official={official} messageId={'message-1' as any} />} />
    </article>
    <div data-reader-tool><OfficialTool {...blockProps} official={official} renderSlotChain={renderSlotChain} block={toolBlock as any} toolName="read" fallback={<span>fallback</span>} /></div>
    {renderSlot(OFFICIAL_SEATS.tail, { openFile: blockProps.openFile, readerProducedPaths: ['/fixture/sample.ts'] })}
    {renderSlot(OFFICIAL_SEATS.nodes, {}, { entryKey: 'future-widget', hookContext: 'turn-context' })}
    <button onClick={() => setText(text + '\n\n继续输出。')}>Append text</button>
  </div></main>;
}
function mountReader() {
  stopReader = slots.register({ name: 'fixture.reader', children: officialChildren(slots) }, ReaderFixture);
  stopMirror = installOfficialSlots(ctx);
}
mountReader();
const root = createRoot(document.getElementById('app')!);
root.render(slots.renderSlot('root', {}));
(window as any).fixture = {
  observations, update: () => liveDetail.set('updated'),
  language: () => { language = 'en'; localeSource.set({ revision: 1 }); },
  addAction: () => slots.register({ name: 'conversation.chat.assistant-actions', id: 'future-action', order: 20 }, memo(() => <button>Future official action</button>)),
  unmount: () => { stopMirror(); stopReader(); }, mount: mountReader,
};

} });
