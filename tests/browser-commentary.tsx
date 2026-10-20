import React, { useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChatSnapshot } from '@deepseek-ai/dsh-client-ui-chat/client';
import { Reader } from '../src/client/Reader.js';
import { createReaderStore } from '../src/client/store.js';
import type { ReaderProps } from '../src/client/types.js';

/**
 * Real Reader + real root/session stores; only conversation data is synthetic.
 *
 * This fixture isolates the "process report narration" bug: an assistant step
 * that carries a long non-reasoning text block (正文) between thinking steps used
 * to be classified as process content and folded away. Contract under test:
 * body text is always visible; folds may only hold reasoning / tool / other
 * process records.
 *
 * Turn layout:
 *   1  closed/completed : step0 = reasoning + 正文A + tool-call ; step1 = reasoning + 最终回答B
 *   2  open             : step0 = reasoning + 进行中汇报正文C ; step1 = reasoning (latest)
 *   3  closed/error     : step0 = reasoning + 失败轮正文D
 *   4  closed/interrupted: step0 = reasoning + 中断轮正文E
 */
const BODY_A = '过程汇报正文A';
const REASON_A = '历史思考：先查简报素材';
const FINAL_B = '最终回答B';
const REASON_B = '第二次思考：整理结论';
const TOOL_SUMMARY = '读取 简报素材.txt';
const BODY_C = '进行中汇报正文C';
const REASON_C0 = '第一轮思考';
const REASON_C1 = '第二轮思考';
const BODY_D = '失败轮正文D';
const REASON_D = '报错前的思考';
const BODY_E = '中断轮正文E';
const REASON_E = '中断前的思考';
// Turn 5 exercises the segmented-report case: two adjacent narration paragraphs
// (with folded reasoning between them) plus a final answer, all with long text.
const BODY_F = '第一段汇报：已完成需求梳理，确认改造点集中在投影层与阅读渲染层。这一步整理的是已经核实的事实，不包括猜测。\n\n第二段汇报：接下来核对折叠链边界，并验证正文在收起状态下仍然可见，同时保持思维链与工具行可以展开。';
const REASON_F0 = '汇报前的思考';
const BODY_G = '补充汇报：折叠只保留思维链与工具调用，正文块保持原位。';
const REASON_G = '补充说明前的思考';
const REASON_H = '收尾思考';
const FINAL_H = '最终回答H';
const TOOL_CALL_ID = 'call-read-1';
const TOOL_ARGS = '{"path":"/fixture/工作区/简报素材.txt"}';

const store = createReaderStore();
const prefs = store.create();
const session = store.create('commentary-fixture');

type Turn = {
  turn: number; status: 'open' | 'closed';
  start: { seq: number; time: number };
  end?: { time: number; data: { reason: { kind: string } } };
  data: Map<string, any>;
  steps: any[];
};
const nodes = new Map<string, any>();
const turns = new Map<number, Turn>();

function newTurn(turn: number, status: 'open' | 'closed', seq: number, reason?: string): Turn {
  const value: Turn = {
    turn, status, start: { seq, time: 1 },
    end: status === 'closed' ? { time: 1001, data: { reason: { kind: reason ?? 'completed' } } } : undefined,
    data: new Map<string, any>(),
    steps: [],
  };
  turns.set(turn, value);
  return value;
}

function addStep(turnNumber: number, step: number, seq: number, status: string, blocks: any[]): any {
  const turn = turns.get(turnNumber)!;
  const data = { turn: turnNumber, step, status, time: 1, blocks };
  const location = { step, start: { seq }, data: new Map([['assistant-step', data]]) };
  turn.steps.push(location);
  nodes.set(`turn-${turnNumber}-step-${step}`, {
    key: `turn-${turnNumber}-step-${step}`, kind: 'assistant-step', visibility: 'visible',
    anchorSeq: seq, location: { kind: 'step', turn, step: location }, data,
  });
  return location;
}

function addToolCallNode(turnNumber: number, key: string, seq: number, location: any, callId: string, argsRaw: string): void {
  const turn = turns.get(turnNumber)!;
  const root = {
    kind: 'tool-result', seq, time: 1, callId,
    call: { name: 'read', argsRaw }, callTime: 1,
    content: [{ kind: 'text', text: '简报素材的摘录内容' }], isError: false, subCalls: [],
  };
  nodes.set(key, {
    key, kind: 'tool-call', visibility: 'visible', anchorSeq: seq,
    location: { kind: 'step', turn, step: location }, data: { root },
  });
}

// --- turn 1: completed; narration sits between reasoning and the final answer.
const turn1 = newTurn(1, 'closed', 100);
turn1.data.set('turn-tail', { closing: { step: 1 } });
const t1s0 = addStep(1, 0, 101, 'settled', [
  { kind: 'reasoning', text: REASON_A },
  { kind: 'text', text: BODY_A },
  { kind: 'tool-call', callId: TOOL_CALL_ID, name: 'read', argsRaw: TOOL_ARGS },
]);
addToolCallNode(1, 'turn-1-tool-call-1', 102, t1s0, TOOL_CALL_ID, TOOL_ARGS);
addStep(1, 1, 103, 'settled', [
  { kind: 'reasoning', text: REASON_B },
  { kind: 'text', text: FINAL_B },
]);

// --- turn 2: open; second reasoning arrives after a process report.
const turn2 = newTurn(2, 'open', 200);
addStep(2, 0, 201, 'settled', [
  { kind: 'reasoning', text: REASON_C0 },
  { kind: 'text', text: BODY_C },
]);
addStep(2, 1, 202, 'running', [
  { kind: 'reasoning', text: REASON_C1 },
]);

// --- turn 3: failed turn; nothing may fold.
newTurn(3, 'closed', 300, 'error');
addStep(3, 0, 301, 'settled', [
  { kind: 'reasoning', text: REASON_D },
  { kind: 'text', text: BODY_D },
]);

// --- turn 4: interrupted turn; nothing may fold.
newTurn(4, 'closed', 400, 'interrupted');
addStep(4, 0, 401, 'settled', [
  { kind: 'reasoning', text: REASON_E },
  { kind: 'text', text: BODY_E },
]);

// --- turn 5: completed turn whose report is split into two narration paragraphs
// with folded reasoning between them; the rail must bridge them after collapsing.
const turn5 = newTurn(5, 'closed', 500);
turn5.data.set('turn-tail', { closing: { step: 2 } });
addStep(5, 0, 501, 'settled', [
  { kind: 'reasoning', text: REASON_F0 },
  { kind: 'text', text: BODY_F },
]);
addStep(5, 1, 502, 'settled', [
  { kind: 'reasoning', text: REASON_G },
  { kind: 'text', text: BODY_G },
]);
addStep(5, 2, 503, 'settled', [
  { kind: 'reasoning', text: REASON_H },
  { kind: 'text', text: FINAL_H },
]);

const chat = {
  order: [
    'turn-1-step-0', 'turn-1-tool-call-1', 'turn-1-step-1',
    'turn-2-step-0', 'turn-2-step-1',
    'turn-3-step-0', 'turn-4-step-0',
    'turn-5-step-0', 'turn-5-step-1', 'turn-5-step-2',
  ],
  nodes,
  timeline: { turns },
} as unknown as ChatSnapshot;
const sessionSnapshot = { running: true, openState: 'ready', pendingSubmissions: [], hasMore: false, loadingOlder: false };
const sessionsSnapshot = { byId: { 'commentary-fixture': { cwd: '/fixture' } } };
const pending = new Map();
const host = { home: '/fixture' };
const useReaderStore: ReaderProps['useStore'] = selector => selector(useSyncExternalStore(session.subscribe, session.getSnapshot));
const props = {
  sessionId: 'commentary-fixture', useChat: selector => selector(chat),
  useSession: selector => selector(sessionSnapshot), useSessions: selector => selector(sessionsSnapshot),
  useSessionStatus: selector => selector(new Map([['commentary-fixture', { running: true, pendingInteraction: pending.get('commentary-fixture'), completionUnread: false }]])),
  useStore: useReaderStore, actions: session.actions, openPrefs: prefs,
  t: key => key, renderSlot: (_name: string, _owner: any, options: any) => options?.fallback ?? null,
  renderSlotChain: (_name: string, _owner: any, options: any) => options?.fallback ?? null,
  loadImage: async () => ({ data: new Uint8Array(), mediaType: 'image/png' }),
  officialImageLoader: Object.assign(async () => null, { peek: () => null }),
  officialFileMentions: () => undefined, officialPreviewFile: () => {},
  officialHost: { getSnapshot: () => host, subscribe: () => () => {} },
  fillComposer: () => true, openFile: () => {}, loadOlder: async () => {}, openView: () => {},
} as unknown as ReaderProps;

Object.assign(window, {
  commentaryFixture: {
    // Exercise the same root preference the Settings panel uses.
    preference: (value: boolean) => prefs.actions.setAutoFold(value),
    state: () => session.getSnapshot(),
    text: { BODY_A, REASON_A, FINAL_B, REASON_B, TOOL_SUMMARY, BODY_C, REASON_C0, REASON_C1, BODY_D, REASON_D, BODY_E, REASON_E, BODY_F, REASON_F0, BODY_G, REASON_G, REASON_H, FINAL_H, TOOL_CALL_ID },
  },
});

createRoot(document.getElementById('app')!).render(
  <div data-conversation-scroll style={{ height: '100vh', overflow: 'auto' }}><Reader {...props} /></div>,
);
