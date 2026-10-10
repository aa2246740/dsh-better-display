import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { ensureStyles } from '../src/client/styles.js';

test('ensureStyles tolerates module evaluation without a document', () => {
  ensureStyles();
});

test('ensureStyles restores removed plugin CSS and remains idempotent', t => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  t.after(() => {
    if (descriptor) Object.defineProperty(globalThis, 'document', descriptor);
    else Reflect.deleteProperty(globalThis, 'document');
  });
  const reader = { dataset: { plugin: 'dsh-better-display', pluginCss: 'dsh-better-display/Reader.module.css' }, textContent: '.reader{height:auto}' };
  const fold = { dataset: { plugin: 'dsh-better-display', pluginCss: 'dsh-better-display/Fold.module.css' }, textContent: '.fold{overflow:hidden}' };
  const foreign = { dataset: { plugin: 'other', pluginCss: 'other/Fold.module.css' }, textContent: '.other{}' };
  const tags = [reader, fold, foreign];
  const document = {
    querySelectorAll: (selector: string) => {
      assert.equal(selector, 'style[data-plugin="dsh-better-display"][data-plugin-css]');
      return tags.filter(tag => tag.dataset.plugin === 'dsh-better-display');
    },
    createElement: (name: string) => { assert.equal(name, 'style'); return { dataset: {}, textContent: '' }; },
    head: { appendChild: (tag: typeof reader) => { tags.push(tag); } },
  };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: document });
  ensureStyles();
  assert.equal(tags.length, 3);
  tags.splice(0, 2);
  ensureStyles();
  assert.deepEqual(tags, [foreign, reader, fold]);
  ensureStyles();
  assert.equal(tags.length, 3);
  tags[1].textContent = '.reader{height:100px}';
  ensureStyles();
  tags.splice(1, 1);
  ensureStyles();
  assert.equal(tags.find(tag => tag.dataset.pluginCss === reader.dataset.pluginCss)?.textContent, '.reader{height:100px}');
});

test('CSS is cached after module injection and restored before mount layout effects', () => {
  const index = readFileSync(new URL('../src/client/index.tsx', import.meta.url), 'utf8');
  const reader = readFileSync(new URL('../src/client/Reader.tsx', import.meta.url), 'utf8');
  assert.match(index, /\nensureStyles\(\);/);
  assert.match(reader, /useInsertionEffect\(\(\) => \{ ensureStyles\(\); \}, \[\]\)/);
});
