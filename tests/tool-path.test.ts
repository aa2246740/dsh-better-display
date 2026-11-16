import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';
import { pathFromToolArgs } from '../src/client/tool-path.js';

/**
 * A tool-call picture must be able to show where it came from.
 *
 * `ImageAttachmentRef.name` is documented as "stripped of local path information", so
 * the attachment itself can never carry a path. The call's arguments do, and a tool
 * result keeps both the parsed view (`args`) and the raw JSON (`call.argsRaw`).
 */
const root = resolve(import.meta.dirname, '..');

test('a path is read from the parsed arguments', () => {
  assert.equal(pathFromToolArgs({ args: { path: '/home/me/shot.png' } }), '/home/me/shot.png');
  assert.equal(
    pathFromToolArgs({ args: { file_path: 'C:\\work\\shot.png' } }),
    'C:\\work\\shot.png'
  );
  assert.equal(
    pathFromToolArgs({ args: { image_path: './artifacts/a.png' } }),
    './artifacts/a.png'
  );
});

test('the raw arguments are used when the parsed view is absent', () => {
  assert.equal(
    pathFromToolArgs({ argsRaw: '{"path":"/tmp/shot.png","scale":2}' }),
    '/tmp/shot.png'
  );
  // Malformed JSON must not throw: a broken call is not a crash.
  assert.equal(pathFromToolArgs({ argsRaw: '{not json' }), undefined);
});

test('the parsed view wins over the raw one', () => {
  assert.equal(
    pathFromToolArgs({ args: { path: '/parsed.png' }, argsRaw: '{"path":"/raw.png"}' }),
    '/parsed.png'
  );
});

test('a call that names no file yields undefined', () => {
  assert.equal(pathFromToolArgs(undefined), undefined);
  assert.equal(pathFromToolArgs({}), undefined);
  assert.equal(pathFromToolArgs({ args: { other: 1 } }), undefined);
  // An empty string is not a path.
  assert.equal(pathFromToolArgs({ args: { path: '   ' } }), undefined);
});

test('the caption prefers the call path and falls back to a suffixed name', () => {
  // The wiring matters as much as the helper: an attachment's own name cannot carry a
  // path, so the picture has to read it from the call.
  const blocks = readFileSync(resolve(root, 'src/client/Blocks.tsx'), 'utf8');
  const tool = readFileSync(resolve(root, 'src/client/ToolActivity.tsx'), 'utf8');
  assert.match(blocks, /const caption = toolPath \?\? attachmentLabel\(/u);
  assert.match(blocks, /const toolPath = useContext\(ToolPathContext\)/u);
  // The tool media supplies the context from the call's arguments.
  assert.match(tool, /pathFromToolArgs\(\{/u);
  assert.match(tool, /<ToolPathContext\.Provider value=\{path\}>/u);
});
