import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PreparingToolCall, RunningToolCall, ToolResultNode } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { activityPhase, activitySummary } from '../src/client/tool-activity.ts';
import type { ToolDraft } from '../src/client/tool-activity.ts';

function draft(name: string, argsRaw: string): ToolDraft {
  return { kind: 'tool-call', callId: 'terminal-preview', name, argsRaw };
}

test('terminal drafts expose a pending placeholder state until a command field appears', () => {
  for (const name of ['bash', 'pwsh']) {
    const early = activitySummary({ draft: draft(name, '{"comman') });
    assert.equal(early.category, 'terminal');
    assert.equal(early.argsState, 'partial');
    assert.equal(early.command, undefined);

    const partial = activitySummary({ draft: draft(name, '{"command":"Get-C') });
    assert.equal(partial.argsState, 'partial');
    assert.equal(partial.command, 'Get-C');
  }
});

test('complete Bash and PowerShell arguments remain available in full', () => {
  for (const name of ['bash', 'pwsh']) {
    const values = {
      command: name === 'pwsh' ? 'Get-ChildItem -Force' : 'printf "ready\\n"',
      workdir: '/work/project',
      description: 'List project files',
      timeout_ms: 4000,
    };
    const model = activitySummary({ draft: draft(name, JSON.stringify(values)) });
    assert.equal(model.argsState, 'complete');
    assert.equal(model.command, values.command);
    assert.deepEqual(model.args, values);
  }
});

test('partial escaped and multiline commands keep their authored text', () => {
  const argsRaw = '{"command":"printf \\"first\\nsecond';
  const model = activitySummary({ draft: draft('bash', argsRaw) });
  assert.equal(model.argsState, 'partial');
  assert.equal(model.command, 'printf "first\nsecond');

  const multiline = 'printf "first line\\nsecond line"\necho 你好';
  const complete = activitySummary({ draft: draft('bash', JSON.stringify({ command: multiline, workdir: '/tmp' })) });
  assert.equal(complete.command, multiline);
  assert.equal(complete.args.workdir, '/tmp');
});

test('complete empty and non-command arguments are not mistaken for partial commands', () => {
  const empty = activitySummary({ draft: draft('bash', '{}') });
  assert.equal(empty.argsState, 'complete');
  assert.deepEqual(empty.args, {});
  assert.equal(empty.command, undefined);

  const read = activitySummary({ draft: draft('read', '{"path":"/tmp/readme.md"}') });
  assert.equal(read.argsState, 'complete');
  assert.equal(read.category, 'read');
  assert.equal(read.command, undefined);
  assert.equal(read.args.path, '/tmp/readme.md');
});

test('the activity lifecycle distinguishes draft, dispatched call, and result', () => {
  const argsRaw = '{"command":"echo ready"}';
  const pending = draft('bash', argsRaw);
  const running: RunningToolCall = {
    phase: 'start', callId: pending.callId, name: pending.name, turn: 1, step: 0, time: 1000, argsRaw, subCalls: [],
  };
  const result: ToolResultNode = {
    kind: 'tool-result', seq: 2, time: 2000, callId: pending.callId,
    call: { name: pending.name, argsRaw }, callTime: 1000,
    content: [{ type: 'text', text: 'ready\n[exit code: 0]' }], isError: false, meta: { exitCode: 0 }, subCalls: [],
  };
  assert.equal(activityPhase({ draft: pending }), 'preparing');
  assert.equal(activityPhase({ block: running }), 'running');
  assert.equal(activityPhase({ block: result }), 'succeeded');
});

test('a canonical preparing call remains preparing until dispatch', () => {
  for (const name of ['bash', 'pwsh']) {
    const block: PreparingToolCall = {
      phase: 'preparing', callId: 'preparing-head', name, turn: 1, step: 0, time: 1000, subCalls: [],
    };
    assert.equal(activityPhase({ block }), 'preparing');
    assert.equal(activityPhase({ block }, true), 'interrupted');
    const model = activitySummary({ block });
    assert.equal(model.name, name);
    assert.equal(model.argsState, 'partial');
    assert.equal(model.raw, '');
    assert.equal(model.command, undefined);
  }
});

test('a canonical preparing head retains progressively generated draft arguments', () => {
  for (const name of ['bash', 'pwsh']) {
    const block: PreparingToolCall = {
      phase: 'preparing', callId: 'preparing-head', name, turn: 1, step: 0, time: 1000, subCalls: [],
    };
    for (const raw of ['{"comman', '{"command":"echo ready']) {
      const pending = { ...draft(name, raw), callId: block.callId };
      const model = activitySummary({ block, draft: pending });
      assert.equal(model.raw, raw);
      assert.equal(model.argsState, 'partial');
      assert.equal(model.command, raw === '{"comman' ? undefined : 'echo ready');
    }
    const dispatched: RunningToolCall = { ...block, phase: 'start', argsRaw: '{"command":"echo sent"}' };
    const model = activitySummary({ block: dispatched, draft: draft(name, '{"command":"stale') });
    assert.equal(activityPhase({ block: dispatched }), 'running');
    assert.equal(model.command, 'echo sent');
    assert.equal(model.argsState, 'complete');
  }
});
