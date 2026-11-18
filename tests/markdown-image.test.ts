import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

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
type MarkdownFileMentions = import('../src/client/markdown/render.js').MarkdownFileMentions;
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

/**
 * Render one inline-code token with a file-mention vocabulary.
 *
 * This is the path a `\`shot.png\`` mention takes, and the one that gains a picture.
 * @param token - the authored code value.
 * @param pathImages - the path resolver.
 * @returns every element the block rendered.
 */
function renderInlineCode(
  token: string,
  pathImages?: MarkdownPathImages,
  mentionKnown = true
): ReactNode[] {
  const mention: MarkdownFileMentions = {
    resolve: value =>
      mentionKnown && value === token
        ? { label: value, title: `打开 ${value}`, open: () => {} }
        : undefined
  };
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          {
            type: 'inlineCode',
            value: token,
            position: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: token.length + 2, offset: token.length + 1 }
            }
          }
        ],
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: token.length + 2, offset: token.length + 1 }
        }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  return renderBlocks(blocks, { ...context(pathImages), fileMentions: mention });
}

/**
 * The `src` of the picture inside a rendered reference.
 *
 * A picture reference now renders as a fragment of two lines — the chip, then the
 * picture — so the element itself carries no `src`; it lives on the picture inside the
 * second line. This walks the tree instead of assuming a depth, because the nesting is
 * an implementation detail that a layout change may adjust.
 * @param element - the rendered reference.
 * @returns the resolved source the picture will load, if any.
 */
function pictureSrc(element: ReactNode): string | undefined {
  if (!isValidElement(element)) return undefined;
  const props = element.props as { src?: string; children?: ReactNode };
  if (typeof props.src === 'string') return props.src;
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) {
    const found = pictureSrc(child);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Every tag rendered inside a reference, for asserting on the chip. */
function renderedTags(element: ReactNode, into: string[] = []): string[] {
  if (!isValidElement(element)) return into;
  if (typeof element.type === 'string') into.push(element.type);
  const props = element.props as { children?: ReactNode };
  const children = Array.isArray(props.children) ? props.children : [props.children];
  for (const child of children) renderedTags(child, into);
  return into;
}

/**
 * Whether a component of this name is anywhere in the tree.
 *
 * A component is not expanded into host tags by element inspection, so an icon child is
 * found by its function name instead.
 * @param nodes - the tree to walk.
 * @param name - the component's declared name.
 */
function containsComponentNamed(nodes: ReactNode[], name: string): boolean {
  for (const node of nodes) {
    if (!isValidElement(node)) continue;
    const type = node.type as { name?: string } | string;
    if (typeof type !== 'string' && type.name === name) return true;
    const props = node.props as { children?: ReactNode };
    const children = Array.isArray(props.children) ? props.children : [props.children];
    if (containsComponentNamed(children, name)) return true;
  }
  return false;
}

test('a Windows image path renders through the file API instead of disappearing', () => {
  const element = renderImage(String.raw`C:\Users\HSG\ego\plan-10px.png`, resolveWith());
  // A resolvable destination renders the picture, not the placeholder.
  assert.notEqual(element.type, UnavailableImage);
  assert.equal(
    pictureSrc(element),
    'http://127.0.0.1:43127/api/file?path=C%3A%5CUsers%5CHSG%5Cego%5Cplan-10px.png'
  );
});

test('a relative image path resolves against the Session workspace', () => {
  const element = renderImage('shots/plan.png', resolveWith(String.raw`C:\repo`));
  assert.notEqual(element.type, UnavailableImage);
  assert.equal(
    pictureSrc(element),
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
  assert.equal(pictureSrc(element), 'https://example.com/a.png');
  assert.equal(asked, false);
});

test('a picture reference renders the picture alone, as the original view does', () => {
  // `![alt](path)` is a picture, not a file reference: the original view shows the
  // picture and no file-name chip. Adding a chip here would change that rendering, which
  // is not what the reader asked for — the chip belongs to the inline-code path.
  const element = renderImage(String.raw`C:\repo\plan.png`, resolveWith(String.raw`C:\repo`));
  const tags = renderedTags(element);
  assert.equal(tags.includes('code'), false, 'no chip on a picture reference');
  assert.equal(tags.includes('span'), false, 'no extra wrapper either');
  assert.notEqual(pictureSrc(element), undefined, 'the picture itself still renders');
});

test('an inline-code picture mention gains the picture below its chip', () => {
  // This is the case the reader reported: the answer names its output as `shot.png`, and
  // the original view shows only the chip. The picture is now loaded underneath it,
  // while the chip keeps its exact rendering.
  const rendered = renderInlineCode(
    'artifacts/dock-preview/dock-zoom.png',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));

  // The chip survives — same code element, same clickable button.
  assert.equal(tags.includes('code'), true, 'the mention keeps its chip');
  // And a picture is added.
  assert.notEqual(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined
  );
});

test('an inline-code mention of a non-picture file gets no picture', () => {
  const rendered = renderInlineCode('docs/openapi.yaml', resolveWith(String.raw`C:\repo`));
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.equal(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'a .yaml mention must not load a picture'
  );
  // The chip is still there.
  assert.equal(flat.flatMap(node => renderedTags(node)).includes('code'), true);
});

test('an unknown token stays inert code with no picture', () => {
  const rendered = renderInlineCode('not-a-known-file', resolveWith(String.raw`C:\repo`), false);
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.equal(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined
  );
});

/**
 * Render one markdown link, the syntax the reader reported.
 *
 * The answer writes `[shot.png](shot.png)`: a link whose text and destination are the
 * same file name. The original view renders that as a blue link, and the picture is what
 * this adds underneath.
 * @param text - the link's text.
 * @param url - its destination.
 * @param pathImages - the path resolver.
 * @returns every element the block rendered.
 */
function renderLink(text: string, url: string, pathImages?: MarkdownPathImages): ReactNode[] {
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url,
            children: [{ type: 'text', value: text }],
            position: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: text.length + 1, offset: text.length }
            }
          }
        ],
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: text.length + 1, offset: text.length }
        }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  return renderBlocks(blocks, context(pathImages));
}

test('a link to a picture loads the picture below its text', () => {
  // This is the reported case: `[积分弹窗-总xx形态方案.png](积分弹窗-总xx形态方案.png)`.
  // A relative destination is not a navigable href, so the link text renders as plain
  // text — that is the original behaviour, not something to change. What is added is the
  // picture, underneath the name.
  const rendered = renderLink(
    'artifacts/dock-preview/dock-zoom.png',
    'artifacts/dock-preview/dock-zoom.png',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.notEqual(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'the picture loads below the link text'
  );
});

test('a link to a non-picture file grows no picture', () => {
  // `.yaml` / `.md` / `.ts` links must not grow a broken picture.
  const rendered = renderLink(
    'docs/openapi.yaml',
    'docs/openapi.yaml',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.equal(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'no picture for a non-image link'
  );
});

test('a link to a remote picture loads it without the workspace resolver', () => {
  let asked = false;
  const rendered = renderLink('a.png', 'https://example.com/a.png', {
    resolve: () => {
      asked = true;
      return undefined;
    }
  });
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.equal(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    'https://example.com/a.png'
  );
  assert.equal(asked, false, 'a remote link must not consult the workspace resolver');
});

/**
 * Render one markdown link that the file vocabulary recognizes.
 *
 * This is the reported shape: `[shot.png](shot.png)`. The original view renders it
 * through its file-link chip — blue, clickable, with a file-type icon — so the chip is
 * what has to survive.
 * @param text - the link's text.
 * @param url - its destination.
 * @param pathImages - the path resolver.
 * @returns every element the block rendered.
 */
function renderFileLink(text: string, url: string, pathImages?: MarkdownPathImages): ReactNode[] {
  const mention: MarkdownFileMentions = {
    resolve: value =>
      value === url ? { label: value, title: `打开 ${value}`, open: () => {} } : undefined
  };
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          {
            type: 'link',
            url,
            children: [{ type: 'text', value: text }],
            position: {
              start: { line: 1, column: 1, offset: 0 },
              end: { line: 1, column: text.length + 1, offset: text.length }
            }
          }
        ],
        position: {
          start: { line: 1, column: 1, offset: 0 },
          end: { line: 1, column: text.length + 1, offset: text.length }
        }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  return renderBlocks(blocks, { ...context(pathImages), fileMentions: mention });
}

test('a recognized file link keeps the original chip, icon and click target', () => {
  // The reader reported losing all three: the blue colour, the file icon, and the
  // ability to click. They come from rendering the destination as a file chip.
  const rendered = renderFileLink(
    '积分弹窗-第四轮实测.png',
    '积分弹窗-第四轮实测.png',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));
  assert.equal(tags.includes('button'), true, 'the chip is a clickable button');
  // The icon is its own component, so it is found by walking the tree rather than by
  // expanding it into host tags.
  assert.equal(
    containsComponentNamed(flat, 'FileGlyph'),
    true,
    'the chip carries a file-type icon'
  );
  // And the picture is added below it.
  assert.notEqual(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'the picture loads below the chip'
  );
});

test('a recognized non-image file link keeps its chip and grows no picture', () => {
  const rendered = renderFileLink(
    'docs/openapi.yaml',
    'docs/openapi.yaml',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));
  assert.equal(tags.includes('button'), true, 'still a clickable chip');
  assert.equal(
    flat.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'no picture for a non-image file'
  );
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
