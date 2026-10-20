import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantChatData, ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { AssistantBlock, TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
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

test('narration is never foldable: body text stays open and ends the fold chain', () => {
  // splitChain only ever receives the foldable run (reasoning/tool/record); the
  // commentary itself is a chain boundary in presentLiveTurn.
  assert.equal(splitChain([reasoning('1')]).fold, null);
  assert.equal(splitChain([reasoning('1'), tool('2')]).fold, null);
  assert.equal(splitChain([other('ctx'), reasoning('1')]).fold, null);
  assert.deepEqual(splitChain([reasoning('1'), tool('2'), reasoning('3')]).fold?.map(step => step.key), ['1', '2']);

  const beforeSecondReasoning = presentLiveTurn([reasoning('1'), body('2')], open);
  assert.deepEqual(kinds(beforeSecondReasoning), [['open', '1'], ['open', '2']]);

  const afterSecondReasoning = presentLiveTurn([reasoning('1'), body('2'), reasoning('3')], open);
  assert.deepEqual(kinds(afterSecondReasoning), [['open', '1'], ['open', '2'], ['open', '3']]);

  const mixed = presentLiveTurn([reasoning('1'), tool('2'), body('3'), reasoning('4'), tool('5'), reasoning('6')], open);
  assert.deepEqual(kinds(mixed), [
    ['open', '1'], ['open', '2'], ['open', '3'],
    ['fold', '思考×1 · 工具×1', ['4', '5']],
    ['open', '6'],
  ]);
  assert.equal(mixed.some(item => item.kind === 'fold' && item.steps.some(step => step.kind === 'body')), false);
  for (const item of mixed) {
    if (item.kind === 'fold') assert.equal(item.summary.includes('输出'), false);
  }
});

test('a second reasoning folds the foldable run before it, never narration', () => {
  const first = presentLiveTurn([reasoning('1'), tool('2')], open);
  assert.deepEqual(kinds(first), [['open', '1'], ['open', '2']]);

  const second = presentLiveTurn([reasoning('1'), tool('2'), reasoning('3')], open);
  assert.deepEqual(kinds(second), [['fold', '思考×1 · 工具×1', ['1', '2']], ['open', '3']]);
  if (second[0]?.kind !== 'fold') throw new Error('missing fold');
  if (second[0].steps[0]?.kind !== 'reasoning') throw new Error('folded reasoning missing');
  assert.equal(second[0].steps[0].blocks[0]?.kind === 'reasoning' && second[0].steps[0].blocks[0].text, '思考 1');
  assert.equal(second[0].summary.includes('思考 1'), false);

  const grown = presentLiveTurn([reasoning('1'), tool('2'), reasoning('3'), tool('4'), reasoning('5')], open);
  if (grown[0]?.kind !== 'fold') throw new Error('missing grown fold');
  assert.deepEqual(grown[0].steps.map(step => step.key), ['1', '2', '3', '4']);
  assert.deepEqual(grown.filter(item => item.kind === 'open').map(item => item.key), ['5']);
  assert.equal(grown[0].summary, '思考×2 · 工具×2');

  const narrationBetween = presentLiveTurn([reasoning('1'), body('2'), reasoning('3'), tool('4'), reasoning('5')], open);
  assert.deepEqual(kinds(narrationBetween), [
    ['open', '1'], ['open', '2'],
    ['fold', '思考×1 · 工具×1', ['3', '4']],
    ['open', '5'],
  ]);
});

test('fold presentation keeps prior step keys so the reader can collapse the same process fragments in place', () => {
  const chain = [reasoning('1'), tool('2')];
  const before = presentLiveTurn(chain, open);
  assert.deepEqual(before.map(item => item.key), ['1', '2']);

  const second = presentLiveTurn([...chain, reasoning('3')], open);
  assert.equal(second[0]?.kind, 'fold');
  if (second[0]?.kind !== 'fold') throw new Error('missing fold');
  assert.equal(second[0].key, 'live-fold:1');
  assert.deepEqual(second[0].steps.map(step => step.key), before.map(item => item.key));
  assert.deepEqual(second.filter(item => item.kind === 'open').map(item => item.key), ['3']);

  const third = presentLiveTurn([...chain, reasoning('3'), tool('4'), reasoning('5')], open);
  if (third[0]?.kind !== 'fold') throw new Error('missing grown fold');
  assert.equal(third[0].key, 'live-fold:1');
  assert.deepEqual(third[0].steps.map(step => step.key), ['1', '2', '3', '4']);
});

test('presentLiveTurn keeps one fold box per foldable run and never hides narration', () => {
  const items = presentLiveTurn([reasoning('1'), tool('2'), reasoning('3'), tool('4'), reasoning('5')], open);
  const folds = items.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 1);
  if (folds[0]?.kind !== 'fold') throw new Error('missing fold');
  assert.equal(folds[0].steps.length, 4);
  assert.deepEqual(items.filter(item => item.kind === 'open').map(item => item.key), ['5']);

  const withNarration = presentLiveTurn([reasoning('1'), tool('2'), body('3'), reasoning('4'), tool('5'), reasoning('6')], open);
  const narratedFolds = withNarration.filter(item => item.kind === 'fold');
  assert.equal(narratedFolds.length, 1);
  assert.deepEqual(withNarration.filter(item => item.kind === 'open').map(item => item.key), ['1', '2', '3', '6']);
  for (const fold of narratedFolds) {
    if (fold.kind !== 'fold') continue;
    assert.deepEqual(fold.steps.map(step => step.key), ['4', '5']);
    assert.equal(fold.steps.some(step => step.kind === 'body'), false);
  }
});

test('mid-turn user insert resets the chain; narration stays open across the reset', () => {
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
    ['open', '4'],
    ['fold', '工具×1', ['5']],
    ['open', '6'],
  ]);
  const folds = after.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 1);
  if (folds[0]?.kind !== 'fold') throw new Error('missing insert fold');
  assert.ok(!folds[0].steps.some(step => ['1', '2', '3', '4', 'insert'].includes(step.key)));
});

test('each chain has at most one fold box; narration starts a new chain', () => {
  const items = presentLiveTurn([
    reasoning('1'), tool('2'), reasoning('3'),
    body('4'),
    tool('5'), reasoning('6'), tool('7'), reasoning('8'),
  ], open);
  const folds = items.filter(item => item.kind === 'fold');
  assert.equal(folds.length, 2);
  if (folds[0]?.kind !== 'fold' || folds[1]?.kind !== 'fold') throw new Error('expected one box per chain');
  assert.deepEqual(folds[0].steps.map(step => step.key), ['1', '2']);
  assert.deepEqual(folds[1].steps.map(step => step.key), ['5', '6', '7']);
  assert.equal(folds[0].summary, '思考×1 · 工具×1');
  assert.equal(folds[1].summary, '思考×1 · 工具×2');
  assert.deepEqual(items.filter(item => item.kind === 'open').map(item => item.key), ['3', '4', '8']);
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

test('disabling auto-fold keeps all steps open as plain streaming steps', () => {
  const steps = [reasoning('1'), body('2'), tool('3'), reasoning('4'), tool('5'), reasoning('6')];
  const items = presentLiveTurn(steps, open, false);
  assert.equal(items.some(item => item.kind === 'fold'), false);
  assert.deepEqual(items.map(item => item.key), ['1', '2', '3', '4', '5', '6']);
  assert.deepEqual(items.map(item => item.kind), ['open', 'open', 'open', 'open', 'open', 'open']);
});
