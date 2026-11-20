import { test } from 'vitest';
import assert from 'node:assert/strict';
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { patchSummary, patchTargets, stoppedFromMeta } from '../src/client/native/patch-targets.ts';
import { toolRowModel } from '../src/client/native/tool-call-model.ts';
import { activityPhase, activitySummary } from '../src/client/tool-activity.ts';

const PATCH = [
  '*** Begin Patch',
  '*** Update File: /work/src/a.ts',
  '@@',
  '-old',
  '+new',
  '*** Update File: /work/src/old.ts',
  '*** Move to: /work/src/new.ts',
  '*** Delete File: /work/src/gone.ts',
  '*** Add File: /work/docs/notes.md',
  '+hello',
  '*** End Patch',
  ''
].join('\n');

function result(argsRaw: string, meta: unknown = {}, isError = false): ToolCallBlock {
  return {
    kind: 'tool-result',
    callId: 'p1',
    time: 2,
    callTime: 1,
    content: [{ type: 'text', text: 'done' }],
    isError,
    meta,
    call: { name: 'apply_patch', argsRaw },
    subCalls: []
  } as unknown as ToolCallBlock;
}

test('patch headers give files in order, with moves and deletions', () => {
  const targets = patchTargets(PATCH);
  assert.deepEqual(targets, [
    { kind: 'update', path: '/work/src/a.ts', label: '/work/src/a.ts' },
    {
      kind: 'update',
      path: '/work/src/new.ts',
      label: '/work/src/new.ts',
      from: '/work/src/old.ts'
    },
    { kind: 'delete', path: undefined, label: '/work/src/gone.ts' },
    { kind: 'add', path: '/work/docs/notes.md', label: '/work/docs/notes.md' }
  ]);
  assert.equal(
    patchSummary(targets, path => path.replace('/work/', '')),
    'src/a.ts, src/old.ts → src/new.ts, src/gone.ts, docs/notes.md'
  );
  assert.deepEqual(patchTargets(undefined), []);
  assert.deepEqual(patchTargets('*** Begin Patch\n'), []);
});

test('a streaming patch ignores a header line that may still be growing', () => {
  assert.deepEqual(patchTargets('*** Begin Patch\n*** Update File: /work/sr'), []);
  assert.deepEqual(
    patchTargets('*** Begin Patch\n*** Update File: /work/src/a.ts\n@@').map(
      target => target.label
    ),
    ['/work/src/a.ts']
  );
  assert.deepEqual(
    patchTargets('*** Begin Patch\r\n*** Add File: C:\\repo\\a.txt\r\n').map(target => target.path),
    ['C:\\repo\\a.txt']
  );
});

test('apply_patch rows are edit rows that name their files, never the patch text', () => {
  const model = toolRowModel('apply_patch', result(JSON.stringify({ input: PATCH })), '/work');
  assert.equal(model.variant, 'edit');
  assert.equal(model.title, 'Edit');
  assert.equal(model.summary, 'src/a.ts, src/old.ts → src/new.ts, src/gone.ts, docs/notes.md');
  // Several files: no single whole-row link, as upstream.
  assert.equal(model.filePath, undefined);
  assert.equal(model.state, 'ok');

  const lone = toolRowModel(
    'apply_patch',
    result(
      JSON.stringify({
        input: '*** Begin Patch\n*** Update File: /work/src/a.ts\n@@\n-a\n+b\n*** End Patch\n'
      })
    ),
    '/work'
  );
  assert.equal(lone.summary, 'src/a.ts');
  assert.equal(lone.filePath, '/work/src/a.ts');

  const deletion = toolRowModel(
    'apply_patch',
    result(
      JSON.stringify({ input: '*** Begin Patch\n*** Delete File: /work/src/a.ts\n*** End Patch\n' })
    ),
    '/work'
  );
  assert.equal(deletion.filePath, undefined);
});

test('a streaming apply_patch row reads files from incomplete argument JSON', () => {
  const partial = JSON.stringify({ input: PATCH }).slice(
    0,
    JSON.stringify({ input: PATCH }).indexOf('@@')
  );
  const running = {
    phase: 'start',
    callId: 'p1',
    name: 'apply_patch',
    argsRaw: partial
  } as unknown as ToolCallBlock;
  const model = toolRowModel('apply_patch', running, '/work');
  assert.equal(model.state, 'running');
  assert.equal(model.summary, 'src/a.ts');
});

test('meta.stopped marks a settled call as failed, as the 0.2.2 official row does', () => {
  assert.equal(stoppedFromMeta({ stopped: true }), true);
  assert.equal(stoppedFromMeta({ stopped: 'yes' }), false);
  assert.equal(stoppedFromMeta(null), false);
  const args = JSON.stringify({ input: PATCH });
  assert.equal(toolRowModel('apply_patch', result(args, { stopped: true })).state, 'error');
  assert.equal(activityPhase({ block: result(args, { stopped: true }) }), 'failed');
  assert.equal(activityPhase({ block: result(args, { stopped: false }) }), 'returned');
});

test('activity summary uses a lone patched file as the target', () => {
  const lone = activitySummary({
    block: result(
      JSON.stringify({ input: '*** Begin Patch\n*** Add File: /work/a.md\n+x\n*** End Patch\n' })
    )
  });
  assert.equal(lone.category, 'write');
  assert.equal(lone.target, '/work/a.md');
  assert.equal(lone.title, '修改 a.md');
  const many = activitySummary({ block: result(JSON.stringify({ input: PATCH })) });
  assert.equal(many.title, '修改代码补丁');
});
