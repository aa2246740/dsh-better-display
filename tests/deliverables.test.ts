import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TurnLocation } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { basename, createProducedFileMentions, getTurnDeliverables } from '../src/client/deliverables.ts';
import type { ReaderFlowEntry } from '../src/client/tool-activity.ts';

test('basename handles POSIX and Windows style paths', () => {
  assert.equal(basename('src/client/Reader.tsx'), 'Reader.tsx');
  assert.equal(basename('C:\\project\\src\\index.ts'), 'index.ts');
  assert.equal(basename('simple.txt'), 'simple.txt');
  assert.equal(basename('/root/file.md/'), 'file.md');
});

test('getTurnDeliverables extracts produced paths from turn deliverables data', () => {
  const map = new Map<string, unknown>();
  map.set('deliverables', {
    produced: [
      { seq: 1, path: 'src/client/Reader.tsx' },
      { seq: 2, path: 'src/client/Reader.module.css' },
      { seq: 3, path: 'src/client/Reader.tsx' }, // duplicate
    ],
  });
  const turn = { data: map } as unknown as TurnLocation;
  const paths = getTurnDeliverables(turn);
  assert.deepEqual(paths, ['src/client/Reader.tsx', 'src/client/Reader.module.css']);
});

test('getTurnDeliverables falls back to tool flow when turn data is absent', () => {
  const flow: ReaderFlowEntry[] = [
    {
      kind: 'tool',
      key: 'tool:1',
      callId: 'call:1',
      step: 1,
      order: 0,
      block: {
        kind: 'tool-call',
        name: 'write',
        argsRaw: JSON.stringify({ file_path: 'src/client/new-feature.ts', content: 'hello' }),
      } as any,
    },
    {
      kind: 'tool',
      key: 'tool:2',
      callId: 'call:2',
      step: 2,
      order: 1,
      block: {
        kind: 'tool-call',
        name: 'edit',
        argsRaw: JSON.stringify({ file_path: 'src/client/Reader.tsx', old_string: 'a', new_string: 'b' }),
      } as any,
    },
    {
      kind: 'tool',
      key: 'tool:3',
      callId: 'call:3',
      step: 3,
      order: 2,
      block: {
        kind: 'tool-result',
        isError: true, // error result should be skipped
        name: 'write',
        argsRaw: JSON.stringify({ file_path: 'bad.txt', content: 'err' }),
      } as any,
    },
    {
      kind: 'tool',
      key: 'tool:4',
      callId: 'call:4',
      step: 4,
      order: 3,
      block: {
        kind: 'tool-call',
        name: 'read', // read should not be considered a deliverable
        argsRaw: JSON.stringify({ file_path: 'package.json' }),
      } as any,
    },
  ];

  const paths = getTurnDeliverables(undefined, flow);
  assert.deepEqual(paths, ['src/client/new-feature.ts', 'src/client/Reader.tsx']);
});

test('createProducedFileMentions resolves exact paths and unique basenames, leaving ambiguous basenames inert', () => {
  const opened: string[] = [];
  const openFile = (p: string) => { opened.push(p); };
  const paths = [
    'src/client/Reader.tsx',
    'src/server/Reader.tsx', // duplicate basename
    'src/client/Reader.module.css', // unique basename
  ];
  const mentions = createProducedFileMentions(paths, openFile);

  // Exact path resolves
  const exact = mentions.resolve('src/client/Reader.tsx');
  assert.ok(exact);
  assert.equal(exact.title, 'src/client/Reader.tsx');
  assert.equal(exact.label, '打开 src/client/Reader.tsx');
  exact.open();
  assert.deepEqual(opened, ['src/client/Reader.tsx']);

  // Unique basename resolves
  const unique = mentions.resolve('Reader.module.css');
  assert.ok(unique);
  assert.equal(unique.title, 'src/client/Reader.module.css');
  unique.open();
  assert.deepEqual(opened, ['src/client/Reader.tsx', 'src/client/Reader.module.css']);

  // Ambiguous basename leaves undefined (never guess or open the wrong file)
  const ambiguous = mentions.resolve('Reader.tsx');
  assert.equal(ambiguous, undefined);

  // Unrelated file leaves undefined
  const unrelated = mentions.resolve('unknown.js');
  assert.equal(unrelated, undefined);
});
