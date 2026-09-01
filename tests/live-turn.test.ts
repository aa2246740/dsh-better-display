import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantChatData } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { AssistantBlock, ChatConversationViewNode, TurnLocation } from '@deepseek-ai/dsh-client-runtime/client';
import { assistantSegments, processExpanded } from '../src/client/projection.ts';
import type { TurnBoundary } from '../src/client/projection.ts';
import { foldSummary, presentLiveTurn, segmentLiveTurn, splitChain } from '../src/client/live-turn.ts';
import type { LiveStep } from '../src/client/live-turn.ts';
import { readerFlow } from '../src/client/tool-activity.ts';

const open: TurnBoundary = { status: 'open', reason: null, latestStep: 4, closingStep: null };
const completed: TurnBoundary = { status: 'closed', reason: 'completed', latestStep: 4, closingStep: 4 };

function reasoning(id: string, text = `思考 ${id}`): LiveStep {
  return { kind: 'reasoning', key: id, nodeKey: id, start: 0, blocks: [{ kind: 'reasoning', text }], step: Number(id.replace(/\D/g, '') || 0) };
}
function body(id: string, text = `输出 ${id}`): LiveStep {
  return { kind: 'body', key: id, nodeKey: id, start: 1, blocks: [{ kind: 'text', text }], step: 0 };
}
function tool(id: string): LiveStep {
  return { kind: 'tool', key: id, entry: { kind: 'tool', key: id, callId: id, step: 0, order: 0, draft: { kind: 'tool-call', callId: id, name: 'bash', argsRaw: '{}' } } };
}
function user(id: string): LiveStep {
  return { kind: 'user', key: id, nodeKey: id };
}
function other(id: string): LiveStep {
  return { kind: 'other', key: id, nodeKey: id };
}

function kinds(items: ReturnType<typeof presentLiveTurn>) {
  return items.map(item => item.kind === 'fold' ? ['fold', item.summary, item.steps.map(step => step.key)] : [item.kind, item.key]);
}

test('body or tool alone never folds, including after the first reasoning', () => {
  assert.equal(splitChain([reasoning('1')]).fold, null);
  assert.equal(splitChain([reasoning('1'), body('2')]).fold, null);
  assert.equal(splitChain([reasoning('1'), body('2'), tool('3')]).fold, null);
  assert.equal(splitChain([body('2'), tool('3')]).fold, null);
  assert.equal(splitChain([other('ctx'), reasoning('1'), body('2')]).fold, null);
});

test('a second reasoning folds every prior step into one box, then a third folds everything before it', () => {
  const first = splitChain([reasoning('1'), body('2'), tool('3')]);
  assert.equal(first.fold, null);
  assert.deepEqual(first.open.map(step => step.key), ['1', '2', '3']);

  const second = splitChain([reasoning('1'), body('2'), tool('3'), reasoning('4')]);
  assert.deepEqual(second.fold?.map(step => step.key), ['1', '2', '3']);
  assert.deepEqual(second.open.map(step => step.key), ['4']);
  assert.equal(foldSummary(second.fold!), '思考×1 · 输出×1 · 工具×1');
  if (second.fold?.[0]?.kind !== 'reasoning') throw new Error('folded reasoning missing');
  assert.equal(second.fold[0].blocks[0]?.kind === 'reasoning' && second.fold[0].blocks[0].text, '思考 1');
  assert.equal(foldSummary(second.fold).includes('思考 1'), false);

  const withTool = splitChain([reasoning('1'), body('2'), tool('3'), reasoning('4'), tool('5')]);
  assert.deepEqual(withTool.fold?.map(step => step.key), ['1', '2', '3']);
  assert.deepEqual(withTool.open.map(step => step.key), ['4', '5']);

  const third = splitChain([reasoning('1'), body('2'), tool('3'), reasoning('4'), tool('5'), reasoning('6')]);
  assert.deepEqual(third.fold?.map(step => step.key), ['1', '2', '3', '4', '5']);
  assert.deepEqual(third.open.map(step => step.key), ['6']);
  assert.equal(foldSummary(third.fold!), '思考×2 · 输出×1 · 工具×2');

  const latest = splitChain([reasoning('1'), body('2'), tool('3'), reasoning('4'), tool('5'), reasoning('6'), body('7')]);
  assert.deepEqual(latest.fold?.map(step => step.key), ['1', '2', '3', '4', '5']);
  assert.deepEqual(latest.open.map(step => step.key), ['6', '7']);
});

test('presentLiveTurn keeps a single prior box rather than one fold per step', () => {
  const items = presentLiveTurn([reasoning('1'), body('2'), tool('3'), reasoning('4'), tool('5'), reasoning('6'), body('7')], open);
  const folds = items.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 1);
  if (folds[0]?.kind !== 'fold') throw new Error('missing fold');
  assert.equal(folds[0].steps.length, 5);
  assert.deepEqual(items.filter(item => item.kind === 'open').map(item => item.key), ['6', '7']);
});

test('mid-turn user insert resets the chain; only the next reasoning folds post-insert priors', () => {
  const before = presentLiveTurn([reasoning('1'), body('2'), tool('3'), user('insert'), body('4'), tool('5')], open);
  assert.deepEqual(kinds(before), [
    ['open', '1'], ['open', '2'], ['open', '3'],
    ['user', 'insert'],
    ['open', '4'], ['open', '5'],
  ]);

  const after = presentLiveTurn([reasoning('1'), body('2'), tool('3'), user('insert'), body('4'), tool('5'), reasoning('6')], open);
  assert.deepEqual(kinds(after), [
    ['open', '1'], ['open', '2'], ['open', '3'],
    ['user', 'insert'],
    ['fold', '输出×1 · 工具×1', ['4', '5']],
    ['open', '6'],
  ]);
  const folds = after.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 1);
  if (folds[0]?.kind !== 'fold') throw new Error('missing insert fold');
  assert.ok(!folds[0].steps.some(step => ['1', '2', '3', 'insert'].includes(step.key)));
});

test('each chain has at most one fold box; a later chain does not split priors into per-step folds', () => {
  const items = presentLiveTurn([
    reasoning('1'), body('2'), tool('3'), reasoning('4'),
    user('insert'),
    body('5'), tool('6'), reasoning('7'),
  ], open);
  const folds = items.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 2);
  if (folds[0]?.kind !== 'fold' || folds[1]?.kind !== 'fold') throw new Error('expected one box per chain');
  assert.deepEqual(folds[0].steps.map(step => step.key), ['1', '2', '3']);
  assert.deepEqual(folds[1].steps.map(step => step.key), ['5', '6']);
  assert.equal(folds[0].summary, '思考×1 · 输出×1 · 工具×1');
  assert.equal(folds[1].summary, '输出×1 · 工具×1');
});

test('successful turn close disables live fold so the existing final-answer rules still apply', () => {
  const items = presentLiveTurn([reasoning('1'), body('2'), tool('3'), reasoning('4'), body('final')], completed);
  assert.equal(items.some(item => item.kind === 'fold'), false);
  assert.deepEqual(items.map(item => item.kind), ['open', 'open', 'open', 'open', 'open']);
  assert.equal(processExpanded(undefined, completed), false);
  assert.equal(processExpanded(undefined, { ...completed, reason: 'error' }), true);
  assert.equal(processExpanded(undefined, { ...completed, reason: 'interrupted' }), true);
  assert.equal(processExpanded(undefined, { ...completed, reason: 'blocked' }), true);
  assert.equal(processExpanded(undefined, { status: 'unknown', reason: null, latestStep: -1, closingStep: null }), true);
});

test('error, interrupt, approval-blocked and unknown terminals do not live-fold away the transcript', () => {
  const steps = [reasoning('1'), body('2'), tool('3'), reasoning('4')];
  for (const reason of ['error', 'interrupted', 'aborted', 'blocked', 'max-tokens', 'future-terminal']) {
    const items = presentLiveTurn(steps, { status: 'closed', reason, latestStep: 4, closingStep: 4 });
    assert.equal(items.some(item => item.kind === 'fold'), false, reason);
    assert.equal(processExpanded(undefined, { status: 'closed', reason, latestStep: 4, closingStep: 4 }), true, reason);
  }
  assert.equal(presentLiveTurn(steps, { status: 'unknown', reason: null, latestStep: -1, closingStep: null }).some(item => item.kind === 'fold'), false);
});

test('segmentation uses existing assistantSegments and tool boundaries and does not invent empty reasoning', () => {
  const think: AssistantBlock = { kind: 'reasoning', text: '第一段思考' };
  const moreThink: AssistantBlock = { kind: 'reasoning', text: '同一思考步骤' };
  const text: AssistantBlock = { kind: 'text', text: '中途说明' };
  const call: AssistantBlock = { kind: 'tool-call', callId: 'c1', name: 'bash', argsRaw: '{"command":"ls"}' };
  const empty: AssistantBlock = { kind: 'reasoning', text: '   ' };
  assert.deepEqual(assistantSegments([think, moreThink, text, call, empty]).map(part => [part.kind, part.start]), [
    ['reasoning', 0], ['body', 2], ['reasoning', 4],
  ]);

  const data: AssistantChatData = { status: 'running', turn: 1, step: 0, blocks: [think, moreThink, text, call], time: 1 };
  const node = {
    key: 'a', id: 'a', kind: 'assistant-step', target: 'chat', data, anchorSeq: 10, visibility: 'visible',
    location: { kind: 'step', step: { step: 0 } },
  } as unknown as ChatConversationViewNode;
  const turn = { turn: 1, steps: [{ step: 0, start: { seq: 10 }, data: { get: () => data } }] } as unknown as TurnLocation;
  const flow = readerFlow({ key: 'turn:1', turn: 1, keys: ['a'] }, turn, key => key === 'a' ? node : undefined);
  const steps = segmentLiveTurn(flow, key => key === 'a' ? node : undefined);
  assert.deepEqual(steps.map(step => step.kind), ['reasoning', 'body', 'tool']);
  assert.equal(steps[0]?.kind === 'reasoning' && steps[0].blocks.length, 2);
  if (steps[0]?.kind !== 'reasoning') throw new Error('missing reasoning');
  assert.equal(steps[0].blocks[0], think);
  assert.equal(steps[0].blocks[1], moreThink);

  const blankData: AssistantChatData = { ...data, blocks: [empty, text] };
  const blank = { ...node, data: blankData } as unknown as ChatConversationViewNode;
  const blankTurn = { turn: 1, steps: [{ step: 0, start: { seq: 10 }, data: { get: () => blankData } }] } as unknown as TurnLocation;
  const blankFlow = readerFlow({ key: 'turn:1', turn: 1, keys: ['a'] }, blankTurn, () => blank);
  assert.deepEqual(segmentLiveTurn(blankFlow, () => blank).map(step => step.kind), ['body']);
});

test('steering in the flow is a chain reset, same as a mid-turn user message', () => {
  const think: AssistantBlock = { kind: 'reasoning', text: '先想' };
  const text: AssistantBlock = { kind: 'text', text: '先说' };
  const later: AssistantBlock = { kind: 'reasoning', text: '插入后再想' };
  const first: AssistantChatData = { status: 'settled', turn: 1, step: 0, blocks: [think, text], time: 1 };
  const second: AssistantChatData = { status: 'running', turn: 1, step: 1, blocks: [later], time: 2 };
  const assistant = (key: string, seq: number, data: AssistantChatData) => ({
    key, id: key, kind: 'assistant-step', target: 'chat', data, anchorSeq: seq, visibility: 'visible',
    location: { kind: 'step', step: { step: data.step } },
  }) as unknown as ChatConversationViewNode;
  const steer = {
    key: 'steer', id: 'steer', kind: 'steering', target: 'chat', data: { content: [{ type: 'text', text: '请改方向' }] },
    anchorSeq: 15, visibility: 'visible', location: { kind: 'turn', turn: { turn: 1 } },
  } as unknown as ChatConversationViewNode;
  const nodes = new Map<string, ChatConversationViewNode>([
    ['a', assistant('a', 10, first)],
    ['steer', steer],
    ['b', assistant('b', 20, second)],
  ]);
  const flow = readerFlow({ key: 'turn:1', turn: 1, keys: ['a', 'steer', 'b'] }, undefined, key => nodes.get(key));
  const items = presentLiveTurn(segmentLiveTurn(flow, key => nodes.get(key)), open);
  assert.deepEqual(kinds(items), [
    ['open', 'a:reasoning:0'], ['open', 'a:body:1'],
    ['user', 'steer'],
    ['open', 'b:reasoning:0'],
  ]);
});
