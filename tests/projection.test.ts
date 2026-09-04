import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AssistantBlock, ToolCallBlock, TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { AssistantChatData, ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client';
import { assistantSegments, boundaryOf, groupNodes, hasProcessContent, hasVisibleBody, isEarlierNarration, processChoiceKey, processExpanded, terminalLabel, toolFailed } from '../src/client/projection.ts';
import type { TurnBoundary } from '../src/client/projection.ts';
import { activityPhase, activitySummary, inputFields, readerFlow } from '../src/client/tool-activity.ts';

const text: AssistantBlock = { kind: 'text', text: '前序说明或回答：不能靠关键词判断。' };
function assistant(values: Partial<AssistantChatData> = {}): AssistantChatData {
  return { status: 'settled', turn: 1, step: 0, blocks: [text], time: 1, ...values };
}
const active: TurnBoundary = { status: 'open', reason: null, latestStep: 2, closingStep: null };
const completed: TurnBoundary = { ...active, status: 'closed', reason: 'completed', closingStep: 2 };

test('reasoning and body retain original order, content and identities across streaming appends', () => {
  const first: AssistantBlock = { kind: 'reasoning', text: '**原始标点**\n  原始空格\n' };
  const later: AssistantBlock = { kind: 'reasoning', text: '正文之后的思考' };
  const segments = assistantSegments([first, text, later]);
  assert.deepEqual(segments.map(part => [part.kind, part.start]), [['reasoning', 0], ['body', 1], ['reasoning', 2]]);
  assert.deepEqual(segments.flatMap(part => part.blocks), [first, text, later]);
  assert.equal(segments[0].blocks[0], first);
  const append = assistantSegments([first, text, later, { kind: 'text', text: '最终正文' }]);
  assert.deepEqual(append.slice(0, 3), segments);
});

test('a settled step alone never means final or disposable', () => {
  assert.equal(isEarlierNarration(assistant(), { ...active, latestStep: 0 }), false);
  assert.equal(isEarlierNarration(assistant(), { ...active, status: 'unknown' }), false);
  assert.equal(isEarlierNarration(assistant({ status: 'running' }), active), false);
  assert.equal(isEarlierNarration(assistant(), active), false);
});

test('process stays open through body output and later steps until successful turn completion', () => {
  assert.equal(processExpanded(undefined, active), true);
  assert.equal(processExpanded(undefined, { ...active, latestStep: 7 }), true);
  assert.equal(processExpanded(undefined, completed), false);
  assert.equal(processExpanded(undefined, { ...active, status: 'unknown' }), true);
  for (const reason of ['error', 'aborted', 'interrupted', 'blocked', 'max-tokens', 'future-terminal']) {
    assert.equal(processExpanded(undefined, { ...completed, reason }), true, reason);
  }
});

test('deliberate process expansion or collapse overrides the automatic lifecycle', () => {
  assert.equal(processExpanded(true, completed), true);
  assert.equal(processExpanded(false, active), false);
  assert.equal(processExpanded(false, { ...completed, reason: 'error' }), false);
});

test('reading during a run does not keep the completed process open; reopening after completion is deliberate', () => {
  const choices: Record<string, boolean> = {};
  choices[processChoiceKey('turn:1', active)] = true;
  assert.equal(processExpanded(choices[processChoiceKey('turn:1', completed)], completed), false);
  assert.equal(processChoiceKey('turn:1', active), processChoiceKey('turn:1', { ...active, latestStep: 9 }));
  choices[processChoiceKey('turn:1', completed)] = true;
  assert.equal(processExpanded(choices[processChoiceKey('turn:1', completed)], completed), true);
  assert.equal(processExpanded(choices[processChoiceKey('turn:2', completed)], completed), false);
});

test('body-only steps do not advertise empty thinking, while real reasoning and earlier progress remain accessible', () => {
  const node = (data: AssistantChatData) => ({ kind: 'assistant-step', visibility: 'visible', data }) as ChatConversationViewNode;
  const closing = node(assistant({ step: 2 }));
  assert.equal(hasProcessContent(closing, active), false);
  assert.equal(hasProcessContent(closing, completed), false);
  assert.equal(hasProcessContent(node(assistant({ step: 2, blocks: [{ kind: 'reasoning', text: '' }, text] })), completed), false);
  assert.equal(hasProcessContent(node(assistant({ step: 2, blocks: [{ kind: 'reasoning', text: '真实思考' }, text] })), active), true);
  assert.equal(hasProcessContent(node(assistant({ step: 1 })), completed), true);
  assert.equal(hasProcessContent({ ...closing, visibility: 'hidden' }, completed), false);
});

test('completed turns preserve the public closing message, even with a later nontext step', () => {
  assert.equal(isEarlierNarration(assistant({ step: 2 }), completed), false);
  assert.equal(isEarlierNarration(assistant({ step: 1 }), { ...completed, closingStep: 1 }), false);
  assert.equal(isEarlierNarration(assistant({ step: 0 }), { ...completed, closingStep: 1 }), true);
  assert.equal(isEarlierNarration(assistant(), { ...completed, closingStep: null }), false);
});

test('all abnormal and unknown terminal states preserve generated prefixes', () => {
  for (const reason of ['error', 'aborted', 'interrupted', 'blocked', 'max-tokens', 'future-terminal']) {
    assert.equal(isEarlierNarration(assistant(), { ...completed, reason }), false, reason);
    assert.ok(terminalLabel(reason), reason);
  }
  assert.equal(isEarlierNarration(assistant({ status: 'interrupted' }), completed), false);
  assert.equal(terminalLabel('completed'), null);
});

test('images, future modalities, and mixed body blocks never disappear into process', () => {
  const unknown: AssistantBlock = { kind: 'other', block: { type: 'mcp-app', html: '<script>window.bad=true</script>' } };
  const image: AssistantBlock = { kind: 'image', attachment: { attachmentId: 'test-attachment' as never, width: 100, height: 100, mediaType: 'image/png', bytes: 10 } };
  for (const blocks of [[unknown], [text, unknown], [image], [text, image]]) {
    assert.equal(isEarlierNarration(assistant({ blocks }), completed), false);
    assert.equal(hasVisibleBody(blocks), true);
  }
  assert.equal(hasVisibleBody([{ kind: 'reasoning', text: 'private display trace' }]), false);
});

test('classification never inspects wording', () => {
  for (const value of ['Final answer:', '正在处理', '请你确认再继续', 'All done', 'Think']) {
    assert.equal(isEarlierNarration(assistant({ step: 2, blocks: [{ kind: 'text', text: value }] }), completed), false);
  }
});

test('structural grouping retains keys and source order and excludes host-hidden rows', () => {
  const turn = { turn: 1, status: 'open', steps: [] } as unknown as TurnLocation;
  const node = (key: string, kind: string, location: ChatConversationViewNode['location'], visibility: 'visible' | 'hidden' = 'visible'): ChatConversationViewNode => ({ key, id: key, kind, target: 'chat', data: {}, anchorSeq: Number(key), visibility, location });
  const nodes = [node('1', 'user', { kind: 'unresolved' }), node('2', 'assistant-step', { kind: 'turn', turn }), node('3', 'tool-call', { kind: 'turn', turn }), node('4', 'context', { kind: 'turn', turn }, 'hidden'), node('5', 'custom', { kind: 'unresolved' })];
  const byKey = new Map(nodes.map(row => [row.key, row]));
  const result = groupNodes(nodes.map(row => row.key), key => byKey.get(key));
  assert.deepEqual(result.map(group => group.keys), [['1'], ['2', '3'], ['5']]);
  assert.deepEqual(result.flatMap(group => group.keys), ['1', '2', '3', '5']);
  assert.equal(result[1]?.key, groupNodes([...nodes.map(row => row.key), 'missing'], key => byKey.get(key))[1]?.key);
});

test('missing historical boundaries remain explicit uncertainty', () => {
  const boundary = boundaryOf(undefined);
  assert.deepEqual(boundary, { status: 'unknown', reason: null, latestStep: -1, closingStep: null });
  assert.equal(isEarlierNarration(assistant(), boundary), false);
});

test('a failed child tool is not hidden by a successful parent summary', () => {
  const failed = { kind: 'tool-result', isError: true, content: [], subCalls: [] } as unknown as ToolCallBlock;
  const parent = { kind: 'tool-result', isError: false, content: [], subCalls: [failed] } as unknown as ToolCallBlock;
  assert.equal(toolFailed(parent), true);
});

test('tool input is visible before execution, including native-hidden tool-only steps', () => {
  const draft = { kind: 'tool-call' as const, callId: 'draft-call', name: 'write', argsRaw: '{"file_path":"/work/view.html","content":"<html>\\n' };
  const data = assistant({ status: 'running', blocks: [draft] });
  const turn = { turn: 1, steps: [{ step: 0, start: { seq: 1 }, data: { get: () => data } }] } as unknown as TurnLocation;
  const group = { key: 'turn:1', turn: 1, keys: [] };
  const pending = readerFlow(group, turn, () => undefined);
  assert.equal(pending.length, 1);
  assert.equal(pending[0]?.kind, 'tool');
  if (pending[0]?.kind !== 'tool') throw new Error('missing tool');
  assert.equal(activityPhase(pending[0]), 'preparing');
  assert.equal(activitySummary(pending[0]).title, '写入 view.html');
  assert.equal(activitySummary(pending[0]).content, '<html>\n');
  const block = { callId: draft.callId, name: 'write', argsRaw: draft.argsRaw, subCalls: [] } as unknown as ToolCallBlock;
  const node = { key: 'tool-native', kind: 'tool-call', visibility: 'visible', anchorSeq: 10, data: { root: block }, location: { kind: 'step', step: { step: 0 } } } as unknown as ChatConversationViewNode;
  const running = readerFlow({ ...group, keys: [node.key] }, turn, () => node);
  assert.equal(running.length, 1);
  assert.equal(running[0]?.key, pending[0].key, 'one call keeps the same React key at execution');
});

test('partial argument parsing respects JSON nesting, escapes and unfinished unicode', () => {
  const source = JSON.stringify({ file_path: '/work/真实.html', content: '"file_path":"fake"\n你好😀', nested: { file_path: 'also fake' } });
  for (let cut = source.indexOf('content') + 10; cut <= source.length; cut++) {
    const fields = inputFields(source.slice(0, cut));
    assert.equal(fields.file_path, '/work/真实.html');
    if (typeof fields.content === 'string') assert.ok('"file_path":"fake"\n你好😀'.startsWith(fields.content));
  }
  assert.equal(inputFields('{"content":"start\\u4f').content, 'start');
  assert.equal(inputFields('{"content":"slash\\\\').content, 'slash\\');
  assert.equal(inputFields('{"nested":{"file_path":"fake"},"file_path":"real').file_path, 'real');
});

test('a nonzero terminal exit is a failure even when the tool transport is non-error', () => {
  const block = { kind: 'tool-result', isError: false, content: [], meta: { exitCode: 7 }, subCalls: [] } as unknown as ToolCallBlock;
  assert.equal(toolFailed(block), true);
  assert.equal(activityPhase({ block }), 'failed');
  assert.equal(activityPhase({ block: { ...block, meta: null } as ToolCallBlock }), 'returned');
  assert.equal(activityPhase({}, true), 'interrupted');
});
