import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { test } from 'node:test';
import { externalClientBundle } from '../tools/client-build.js';

// Exercise the actual build plugin so options cannot drift from production.
async function readerCss(): Promise<string> {
  const configs = externalClientBundle('dsh-better-display', [], { clientEntry: 'src/client/index.tsx' });
  const client = configs.find(config => config.name === 'dsh-better-display/client');
  const plugin = client?.plugins.find(plugin => plugin.name === 'dshx-css-modules-inline');
  assert.ok(plugin);
  const source = await plugin.load.call({}, `\0dshx-css-module:${resolve('src/client/Reader.module.css')}.mjs`);
  const literal = /^const css = (.+);$/m.exec(source)?.[1];
  assert.ok(literal, 'the build emits an inline CSS string');
  const css: unknown = JSON.parse(literal);
  assert.equal(typeof css, 'string');
  if (typeof css !== 'string') throw new Error('Expected CSS text');
  return css;
}

test('built Reader CSS retains Chromium blur and the older Safari fallback', async () => {
  const css = await readerCss();
  assert.match(css, /(?<![\w-])backdrop-filter:blur\(12px\)/);
  assert.match(css, /-webkit-backdrop-filter:blur\(12px\)/);
  const prefixed = [...css.matchAll(/-webkit-backdrop-filter:([^;}]+)/g)].map(match => match[1]);
  const standard = [...css.matchAll(/(?<![\w-])backdrop-filter:([^;}]+)/g)].map(match => match[1]);
  assert.deepEqual(standard, prefixed, 'every Safari fallback also has a working standard declaration');
});
