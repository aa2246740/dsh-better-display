import assert from 'node:assert/strict';
import { test } from 'node:test';
import { toolUpdateRows } from '../src/client/native/tool-update.js';

test('a single tool addition is its own closed row', () => {
  assert.deepEqual(toolUpdateRows([{ type: 'tool-addition', toolName: 'search' }]), {
    added: ['search'],
    removed: [],
    single: { type: 'tool-addition', toolName: 'search' },
  });
});

test('mixed tool changes stay one expandable update', () => {
  assert.deepEqual(toolUpdateRows([
    { type: 'tool-addition', toolName: 'search' },
    { type: 'tool-addition', toolName: 'read_file' },
    { type: 'tool-removal', toolName: 'old_search' },
  ]), {
    added: ['search', 'read_file'],
    removed: ['old_search'],
    single: null,
  });
});

test('text or a missing tool name stays a generic context row', () => {
  assert.equal(toolUpdateRows([{ type: 'text', toolName: 'search' }]), null);
  assert.equal(toolUpdateRows([{ type: 'tool-addition' }]), null);
  assert.equal(toolUpdateRows([]), null);
  assert.equal(toolUpdateRows([
    { type: 'tool-addition', toolName: 'search' },
    { type: 'text' },
  ]), null);
});
