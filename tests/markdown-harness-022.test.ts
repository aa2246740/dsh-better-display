/** Harness 0.2.2-rc.5 Markdown fixes ported into the Reader fork. */
import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import type { Root } from 'mdast';
import { parseGfm, parseGfmWithMath } from '../src/client/markdown/parse.ts';

// Same isolation as markdown-image.test.ts: the real primitives pull CSS modules Node cannot load.
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ CodeBlock: () => null }));
vi.mock('../src/client/McpAppFrame.js', () => ({ McpAppCodeBlock: () => null, StreamingMcpAppPlaceholder: () => null }));
const cssModule = new Proxy({}, { get: (_target, name) => String(name) });
vi.mock('../src/client/markdown/MarkdownText.module.css', () => ({ default: cssModule }));
const { freshImageUrl } = await import('../src/client/markdown/render.js');

function types(root: Root): string[] {
  const out: string[] = [];
  const walk = (node: { type: string; children?: unknown[] }) => {
    out.push(node.type);
    for (const child of node.children ?? []) walk(child as { type: string; children?: unknown[] });
  };
  walk(root);
  return out;
}

function firstUrl(root: Root): string | undefined {
  let url: string | undefined;
  const walk = (node: { type: string; url?: string; children?: unknown[] }) => {
    if (url === undefined && (node.type === 'image' || node.type === 'link' || node.type === 'definition')) url = node.url;
    for (const child of node.children ?? []) walk(child as { type: string; children?: unknown[] });
  };
  walk(root);
  return url;
}

for (const [name, parse] of [['parseGfm', parseGfm], ['parseGfmWithMath', parseGfmWithMath]] as const) {
  test(`${name}: a single tilde stays literal, a double tilde strikes`, () => {
    assert.equal(types(parse('range 10~20 and 30~40')).includes('delete'), false);
    assert.equal(types(parse('~~gone~~')).includes('delete'), true);
  });

  test(`${name}: Windows path destinations keep every backslash`, () => {
    assert.equal(firstUrl(parse(String.raw`![shot](D:\repo\.github\a_b.png)`)), String.raw`D:\repo\.github\a_b.png`);
    // A backslash before punctuation stays literal too (CommonMark would read `\(` as an escape).
    assert.equal(firstUrl(parse(String.raw`[cfg](D:\a\(b\).md)`)), String.raw`D:\a\(b\).md`);
    assert.equal(firstUrl(parse('[ref]: C:\\a\\.b.png\n\n![x][ref]')), String.raw`C:\a\.b.png`);
    // A URL or a POSIX path still parses with CommonMark escapes.
    assert.equal(firstUrl(parse(String.raw`[u](https://host/a\_b)`)), 'https://host/a_b');
    assert.equal(firstUrl(parse('![p](/tmp/a.png)')), '/tmp/a.png');
  });
}

test('file-route images carry a per-mount load number; other URLs are unchanged', () => {
  assert.equal(freshImageUrl('http://127.0.0.1:4000/api/file?path=%2Ftmp%2Fa.png', 3),
    'http://127.0.0.1:4000/api/file?path=%2Ftmp%2Fa.png&load=3');
  assert.equal(freshImageUrl('dsh-app://app/api/file?path=%2Ftmp%2Fa.png', 4), 'dsh-app://app/api/file?path=%2Ftmp%2Fa.png&load=4');
  assert.equal(freshImageUrl('https://example.com/a.png', 5), 'https://example.com/a.png');
  assert.equal(freshImageUrl('not a url', 6), 'not a url');
});
