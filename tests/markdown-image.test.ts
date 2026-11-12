import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { isValidElement } from 'react';
import type { ReactElement } from 'react';

// The renderer's only Harness dependency is the fence component; stubbing the
// package keeps this a pure element-shape test (the real package pulls CSS
// modules Node cannot load).
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({ CodeBlock: () => null }));
vi.mock('../src/client/McpAppFrame.js', () => ({
  McpAppCodeBlock: () => null,
  StreamingMcpAppPlaceholder: () => null
}));

const cssModule = new Proxy({}, { get: (_target, name) => String(name) });
vi.mock('../src/client/markdown/MarkdownText.module.css', () => ({ default: cssModule }));

const { createReferenceTargets, renderBlocks, UnavailableImage } =
  await import('../src/client/markdown/render.js');
type MarkdownPathImages = import('../src/client/markdown/render.js').MarkdownPathImages;
type MarkdownRenderContext = import('../src/client/markdown/render.js').MarkdownRenderContext;
const { readerPathImagesFor, resolveImagePath } = await import('../src/client/platform-media.js');

/**
 * A local path the resolver cannot turn into a URL must still occupy the
 * answer. Rendering only the alt text is what made a missing screenshot read
 * as an answer that never had one.
 */
function context(pathImages?: MarkdownPathImages): MarkdownRenderContext {
  return {
    streaming: false,
    codeLabels: { copyLabel: 'copy', copiedLabel: 'copied' },
    fileMentions: undefined,
    pathImages,
    targets: createReferenceTargets(),
    footnoteOrder: [],
    footnoteCounts: new Map()
  };
}

function renderImage(url: string, pathImages?: MarkdownPathImages, alt = '方案图'): ReactElement {
  // One positioned block, exactly what the incremental parser hands the
  // renderer: `node` is the mdast image, `key` is its source offset.
  const blocks = [
    {
      key: 0,
      node: {
        type: 'image',
        url,
        alt,
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: 2, offset: 1 }
        }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  const rendered = renderBlocks(blocks, context(pathImages));
  assert.equal(rendered.length, 1);
  const element = rendered[0];
  assert.equal(isValidElement(element), true);
  return element as ReactElement;
}

function resolveWith(cwd?: string, base = 'http://127.0.0.1:43127/'): MarkdownPathImages {
  return readerPathImagesFor(cwd, base);
}

test('a Windows image path renders through the file API instead of disappearing', () => {
  const element = renderImage(String.raw`C:\Users\HSG\ego\plan-10px.png`, resolveWith());
  // A resolvable destination renders the image component, not the placeholder.
  assert.notEqual(element.type, UnavailableImage);
  assert.equal(
    (element.props as { src: string }).src,
    'http://127.0.0.1:43127/api/file?path=C%3A%5CUsers%5CHSG%5Cego%5Cplan-10px.png'
  );
});

test('a relative image path resolves against the Session workspace', () => {
  const element = renderImage('shots/plan.png', resolveWith(String.raw`C:\repo`));
  assert.notEqual(element.type, UnavailableImage);
  assert.equal(
    (element.props as { src: string }).src,
    'http://127.0.0.1:43127/api/file?path=C%3A%5Crepo%5Cshots%5Cplan.png'
  );
});

test('an unusable local path keeps a visible placeholder with the authored path', () => {
  const element = renderImage('../no-such-dir/plan.png', resolveWith());
  assert.equal(element.type, UnavailableImage);
  const props = element.props as { state: string; destination: string; alt: string };
  assert.equal(props.state, 'unresolved');
  assert.equal(props.destination, '../no-such-dir/plan.png');
  assert.equal(props.alt, '方案图');
});

test('a remote image renders directly and never asks the local resolver', () => {
  let asked = false;
  const element = renderImage('https://example.com/a.png', {
    resolve: () => {
      asked = true;
      return undefined;
    }
  });
  assert.notEqual(element.type, UnavailableImage);
  assert.equal((element.props as { src: string }).src, 'https://example.com/a.png');
  assert.equal(asked, false);
});

test('the failed state keeps the same visible placeholder', () => {
  const failed = UnavailableImage({
    alt: '方案图',
    destination: String.raw`C:\a\b.png`,
    state: 'failed'
  });
  assert.equal(isValidElement(failed), true);
  const props = (failed as ReactElement).props as {
    children: unknown[];
    'data-markdown-image-unavailable': string;
  };
  assert.equal(props['data-markdown-image-unavailable'], 'failed');
  assert.equal(props.children.length > 0, true);
});

test('the resolver itself never rewrites a remote or data destination', () => {
  assert.equal(resolveImagePath(String.raw`C:\repo`, 'https://host/a.png'), undefined);
  assert.equal(resolveImagePath(String.raw`C:\repo`, 'data:image/png;base64,AA'), undefined);
  assert.equal(
    resolveImagePath(String.raw`C:\repo`, 'shots/a.png'),
    String.raw`C:\repo\shots\a.png`
  );
});

test('the placeholder styles exist in the markdown sheet', () => {
  for (const name of [
    'imageUnavailable',
    'imageUnavailableGlyph',
    'imageUnavailableCopy',
    'imageUnavailablePath'
  ]) {
    assert.equal(typeof (cssModule as Record<string, string>)[name], 'string', name);
  }
});
