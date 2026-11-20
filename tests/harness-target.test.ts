import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const baseline = JSON.parse(read('compat/harness.json')) as {
  harnessVersion: string;
  harnessCommit: string;
};
const tag = `dsh-v${baseline.harnessVersion}`;

test('CI and publish clone the baseline harness tag', () => {
  for (const file of ['.github/workflows/ci.yml', '.github/workflows/publish.yml']) {
    const text = read(file);
    assert.match(text, /compat\/harness\.json/);
    assert.doesNotMatch(text, /dsh-v\d/);
    assert.match(text, /dsh-v\$\{ver\}/);
  }
  assert.match(read('scripts/check-harness-compat.mjs'), /compat\/harness\.json/);
});

test('the written target matches the baseline', () => {
  for (const file of [
    'README.md',
    'README.en.md',
    'CHANGELOG.md',
    'docs/official-rendering-bridge.md'
  ]) {
    const text = read(file);
    assert.ok(text.includes(tag), `${file} does not mention ${tag}`);
    assert.ok(text.includes('compat/harness.json'), `${file} does not name the baseline`);
  }
  assert.ok(read('README.md').includes(baseline.harnessCommit));
  assert.ok(read('README.en.md').includes(baseline.harnessCommit));
});
