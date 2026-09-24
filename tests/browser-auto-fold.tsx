import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
import { Reader } from '../src/client/Reader.js';
import { createReaderStore } from '../src/client/store.js';
import type { ReaderProps } from '../src/client/types.js';

// Real Reader and real root/session stores; only conversation data is synthetic.
const store = createReaderStore();
const prefs = store.create();
const session = store.create('auto-fold-fixture');
const nodes = new Map();
const turns = new Map();
for (const [number, closed] of [[1, true], [2, false]] as const) {
  const turn = {
    turn: number, status: closed ? 'closed' : 'open',
    start: { seq: number * 10, time: 1 },
    end: closed ? { time: 1001, data: { reason: { kind: 'completed' } } } : undefined,
    data: new Map(closed ? [['turn-tail', { closing: { step: 1 } }]] : []),
    steps: [] as any[],
  };
  for (let step = 0; step < 2; step++) {
    const key = `turn-${number}-step-${step}`;
    const data = { turn: number, step, status: closed || step === 0 ? 'settled' : 'running', time: 1,
      blocks: [
        { kind: 'reasoning', text: closed ? `已完成思考 ${step}` : `进行中思考 ${step}` },
        { kind: 'text', text: closed && step === 1 ? '最终回答始终保留' : `过程说明 ${number}-${step}` },
      ],
    };
    const location = { step, start: { seq: number * 10 + step }, data: new Map([['assistant-step', data]]) };
    turn.steps.push(location);
    nodes.set(key, { key, kind: 'assistant-step', visibility: 'visible', anchorSeq: number * 10 + step,
      location: { kind: 'step', turn, step: location }, data });
  }
  turns.set(number, turn);
}
const chat = { order: [...nodes.keys()], nodes, timeline: { turns } } as unknown as ChatSnapshot;
const sessionSnapshot = { running: true, openState: 'ready', pendingSubmissions: [], hasMore: false, loadingOlder: false };
const sessionsSnapshot = { byId: { 'auto-fold-fixture': { cwd: '/fixture' } } };
const pending = new Map();
const host = { home: '/fixture' };
const useReaderStore: ReaderProps['useStore'] = selector => selector(useSyncExternalStore(session.subscribe, session.getSnapshot));
const props = {
  sessionId: 'auto-fold-fixture', useChat: selector => selector(chat),
  useSession: selector => selector(sessionSnapshot), useSessions: selector => selector(sessionsSnapshot),
  useSessionStatus: selector => selector(new Map([['auto-fold-fixture', { running: true, pendingInteraction: pending.get('auto-fold-fixture'), completionUnread: false }]])),
  useStore: useReaderStore, actions: session.actions, openPrefs: prefs,
  t: key => key, renderSlot: (_name, _owner, options) => options?.fallback ?? null,
  renderSlotChain: (_name, _owner, options) => options?.fallback ?? null,
  loadImage: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }),
  officialImageLoader: Object.assign(async () => null, { peek: () => null }),
  officialFileMentions: () => undefined, officialPreviewFile: () => {},
  officialHost: { getSnapshot: () => host, subscribe: () => () => {} },
  fillComposer: () => true, openFile: () => {}, loadOlder: async () => {}, openView: () => {},
} as ReaderProps;

Object.assign(window, { autoFoldFixture: {
  // Exercise Settings' root preference path without recreating the Reader.
  preference: (value: boolean) => prefs.actions.setAutoFold(value),
  state: () => session.getSnapshot(),
} });
createRoot(document.getElementById('app')!).render(
  <div data-conversation-scroll style={{ height: '100vh', overflow: 'auto' }}><Reader {...props} /></div>,
);
