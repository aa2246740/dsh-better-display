import { test, vi } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isValidElement } from 'react';
import type { ReactElement, ReactNode } from 'react';

const root = resolve(import.meta.dirname, '..');

// The renderer's only Harness dependency is the fence component; stubbing the
// package keeps this a pure element-shape test (the real package pulls CSS
// modules Node cannot load).
// Expanding a function component by calling it is how these assertions see through the
// wrapper that places a picture. The picture trigger inside it uses hooks, so React warns
// even though the component is skipped. That warning is expected here and is filtered so
// a real one still stands out.
const realConsoleError = console.error;
console.error = (...args: unknown[]): void => {
  if (typeof args[0] === 'string' && /Invalid hook call|Rules of Hooks/u.test(args[0])) return;
  realConsoleError(...args);
};

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
const { localFilePath } = await import('../src/client/markdown/local-path.js');

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
  // A list can appear as a child (`.map` produces one), so arrays are walked too.
  if (Array.isArray(element)) {
    for (const item of element) {
      const found = pictureSrc(item);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (!isValidElement(element)) return undefined;
  const props = element.props as { src?: string; children?: ReactNode };
  if (typeof props.src === 'string') return props.src;
  // A function component wraps the picture; expand it the way React would at paint time.
  // Calling a component outside a renderer is only safe while it holds no hooks, so the
  // expansion is skipped for one that does (the picture trigger uses `useEffect`).
  if (typeof element.type === 'function' && !usesHooks(element.type)) {
    try {
      const expanded = (element.type as (props: unknown) => ReactNode)(props);
      const found = pictureSrc(expanded);
      if (found !== undefined) return found;
    } catch {
      /* Fall through to children. */
    }
  }
  return pictureSrc(props.children);
}

/**
 * Whether a component calls a hook, by reading its source.
 *
 * Expanding a component by calling it is how these assertions see through the wrapper
 * that now places a picture. A component with hooks cannot be called that way, so the
 * walk has to know which ones to leave alone. The build rewrites hooks to
 * `react.useXxx`, so both spellings are matched.
 * @param component - the component to inspect.
 * @returns true when its body mentions a React hook.
 */
function usesHooks(component: unknown): boolean {
  const source = typeof component === 'function' ? component.toString() : '';
  return /\buse[A-Z][a-zA-Z]*\s*\(/u.test(source) || /\breact\.use[A-Z]/u.test(source);
}

/** Every tag rendered inside a reference, for asserting on the chip. */
function renderedTags(element: ReactNode, into: string[] = []): string[] {
  if (Array.isArray(element)) {
    for (const item of element) renderedTags(item, into);
    return into;
  }
  if (!isValidElement(element)) return into;
  if (typeof element.type === 'string') into.push(element.type);
  const props = element.props as { children?: ReactNode };
  // A function component holds the real tags; expand it the way React would at paint time.
  if (typeof element.type === 'function' && !usesHooks(element.type)) {
    try {
      renderedTags((element.type as (props: unknown) => ReactNode)(props), into);
    } catch {
      /* Fall through to children. */
    }
  }
  renderedTags(props.children, into);
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
function containsComponentNamed(nodes: ReactNode, name: string): boolean {
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const node of list) {
    if (!isValidElement(node)) continue;
    const type = node.type as { name?: string } | string;
    if (typeof type !== 'string' && type.name === name) return true;
    const props = node.props as { children?: ReactNode };
    // A wrapper component holds the icon; expand it the way React would at paint time.
    if (typeof type === 'function' && !usesHooks(type)) {
      try {
        const expanded = (type as (props: unknown) => ReactNode)(props);
        if (containsComponentNamed(expanded, name)) return true;
      } catch {
        /* Fall through to children. */
      }
    }
    if (containsComponentNamed(props.children, name)) return true;
  }
  return false;
}

/**
 * The first element with this host tag, expanding function components on the way.
 *
 * A picture reference now renders through `ChipWithPicture`, a plain function component,
 * so the tree handed back by `renderBlocks` holds a component element rather than host
 * tags. React would expand it at paint time; these assertions need the same view, so the
 * walk calls the component directly.
 * @param nodes - the tree to walk.
 * @param tag - the host tag name, such as `button`.
 */
function findElementTag(nodes: ReactNode, tag: string): ReactElement | undefined {
  const expand = (node: ReactNode): ReactNode => {
    if (!isValidElement(node)) return node;
    if (typeof node.type === 'string') return node;
    const type = node.type as (props: unknown) => ReactNode;
    if (typeof type !== 'function') return node;
    try {
      return type((node.props as { children?: ReactNode }) ?? {});
    } catch {
      return node;
    }
  };
  const list = Array.isArray(nodes) ? nodes : [nodes];
  for (const raw of list) {
    const node = expand(raw);
    if (Array.isArray(node)) {
      const found = findElementTag(node, tag);
      if (found !== undefined) return found;
      continue;
    }
    if (!isValidElement(node)) continue;
    if (node.type === tag) return node;
    const found = findElementTag((node.props as { children?: ReactNode }).children, tag);
    if (found !== undefined) return found;
  }
  return undefined;
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

test('an inline-code file mention keeps the original chip shape', () => {
  // The reader reported the chip losing its icon and its blue link styling: a token that
  // the file vocabulary knows became a grey code box. The chip has to be a button with
  // the file mark in front of the name, like the original view.
  const rendered = renderInlineCode('docs/openapi.yaml', resolveWith(String.raw`C:\repo`));
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));
  assert.equal(tags.includes('button'), true, 'the chip is a clickable button');
  assert.equal(containsComponentNamed(flat, 'FileGlyph'), true, 'the chip carries its icon');
  // The icon is a sibling of the name inside the button, not a wrapper around it.
  const button = findElementTag(flat, 'button');
  assert.notEqual(button, undefined, 'the button is present');
});

test('inline-code mentions come only from the Host vocabulary', () => {
  // The reader used to add a resolver over the turn's deliverables, which included files
  // inferred from write/edit calls. That made a plain token like `path-box.tsx` a
  // clickable chip merely because this turn had created the file — the over-match the
  // reader reported. Only the Host's rule decides now, which is the original view's rule.
  const reader = readFileSync(resolve(root, 'src/client/Reader.tsx'), 'utf8');
  assert.match(
    reader,
    /props\.officialFileMentions\(tailOwner\)/u,
    'the Host vocabulary is the source'
  );
  assert.doesNotMatch(
    reader,
    /createProducedFileMentions/u,
    'no reader-side resolver over the deliverables'
  );
});

test('the preview panel dependency is declared, or the panel is never resolvable', () => {
  // `sidebarRight` is an injected service name in this Host: it appears in the official
  // chat module's own `inject` list. Reading it as `ctx.get('sidebarRight')` returns
  // undefined, and because `mention.open` has no try/catch that failure was silent —
  // the click did nothing at all, with no error in the console.
  const source = readFileSync(resolve(root, 'src/client/index.tsx'), 'utf8');
  const injectList = /export const inject = \[([\s\S]*?)\]/u.exec(source)?.[1] ?? '';
  assert.match(injectList, /'sidebarRight'/u, 'the panel dependency must be injected');
  // And it is read off the context, the way the Host reads it.
  assert.match(source, /ctx as unknown as \{ sidebarRight\?: SidebarRightFace \}/u);
  assert.match(source, /sidebar\.openResource\(/u);
  // The path is resolved against the workspace before it becomes a file address, as the
  // Host's own openFile does; passing the raw token produces an address the panel cannot
  // resolve.
  assert.match(source, /resolveWorkspacePath\(cwd, path\)/u);
});

test('the chip icon follows the file type, as the original view does', () => {
  // The reader compared the two views and the icons differed: the Host gives a source
  // file the `<>` mark, an image a picture mark, and other files a page. One document
  // glyph for everything is not the same rendering.
  const glyph = readFileSync(resolve(root, 'src/client/markdown/file-glyph.tsx'), 'utf8');
  assert.match(glyph, /glyphKindOf/u);
  assert.match(glyph, /CODE_EXTENSIONS/u);
  assert.match(glyph, /kind === 'code'/u);
  assert.match(glyph, /kind === 'image'/u);
  assert.match(glyph, /kind === 'document'/u);
  // A source file is in the code group, not in the document fallback.
  const codeGroup = /CODE_EXTENSIONS = new Set\(\[([\s\S]*?)\]\)/u.exec(glyph)?.[1] ?? '';
  assert.match(codeGroup, /'ts'/u, 'a .ts file maps to the code glyph');
  assert.match(codeGroup, /'tsx'/u);
  // And the renderer puts it in front of the chip's name.
  const renderer = readFileSync(resolve(root, 'src/client/markdown/render.tsx'), 'utf8');
  assert.match(renderer, /import \{ FileGlyph \} from '\.\/file-glyph\.js'/u);
  assert.match(renderer, /<FileGlyph path=\{value\} \/>/u);
});

test('clicking a file chip calls the openFile the owner supplies', () => {
  // This is the assertion the last two attempts lacked. They checked that the code
  // existed and still shipped a chip that did nothing when clicked, because the renderer
  // used the mention's own opener instead of the panel route. Here the click is invoked.
  const opened: string[] = [];
  const mention: MarkdownFileMentions = {
    resolve: value => ({ label: value, title: value, open: () => opened.push('mention') })
  };
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          {
            type: 'inlineCode',
            value: 'docs/openapi.yaml',
            position: { start: { offset: 0 }, end: { offset: 18 } }
          }
        ],
        position: { start: { offset: 0 }, end: { offset: 18 } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  const rendered = renderBlocks(blocks, {
    ...context(resolveWith(String.raw`C:\repo`)),
    fileMentions: mention,
    openFile: path => opened.push(path)
  });
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const button = findElementTag(flat, 'button');
  assert.notEqual(button, undefined, 'the token became a chip');
  // Invoke the click the way a reader would.
  const onClick = (button!.props as { onClick?: () => void }).onClick;
  assert.equal(typeof onClick, 'function', 'the chip is clickable');
  onClick!();
  assert.deepEqual(opened, ['docs/openapi.yaml'], 'the click opened through openFile');
});

test('with no openFile supplied the mention opener is used', () => {
  const opened: string[] = [];
  const mention: MarkdownFileMentions = {
    resolve: value => ({ label: value, title: value, open: () => opened.push('mention') })
  };
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          {
            type: 'inlineCode',
            value: 'docs/openapi.yaml',
            position: { start: { offset: 0 }, end: { offset: 18 } }
          }
        ],
        position: { start: { offset: 0 }, end: { offset: 18 } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  const rendered = renderBlocks(blocks, { ...context(), fileMentions: mention });
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const onClick = (findElementTag(flat, 'button')!.props as { onClick?: () => void }).onClick;
  onClick!();
  assert.deepEqual(opened, ['mention'], 'the mention opener is the fallback');
});

/**
 * Render one heading the way the reader wrote it.
 *
 * `## 方案图：[方案-分档窗口UI.png](方案-分档窗口UI.png)` — a heading whose only link is a
 * picture. The original view keeps the heading on one line and shows nothing else; the
 * plugin adds the picture, which has to sit below the heading rather than inside it.
 * @param label - the heading's leading text.
 * @param file - the linked file name, used for both text and destination.
 * @param pathImages - the path resolver.
 * @returns every element the block rendered.
 */
function renderHeading(label: string, file: string, pathImages?: MarkdownPathImages): ReactNode[] {
  const blocks = [
    {
      key: 0,
      node: {
        type: 'heading',
        depth: 2,
        children: [
          { type: 'text', value: label },
          {
            type: 'link',
            url: file,
            children: [{ type: 'text', value: file }],
            position: {
              start: { offset: label.length },
              end: { offset: label.length + file.length }
            }
          }
        ],
        position: { start: { offset: 0 }, end: { offset: label.length + file.length } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  return renderBlocks(blocks, context(pathImages));
}

test('a picture in a heading is emitted below the heading, not inside it', () => {
  // The reader compared the two views: the original keeps `## 方案图：[x.png](x.png)` on one
  // line, and the plugin split it into two. A block chip inside the heading is what broke
  // the line, so the picture has to leave the heading entirely.
  const rendered = renderHeading(
    '方案图：',
    'artifacts/dock-preview/dock-zoom.png',
    resolveWith(String.raw`C:\repo`)
  );
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  // The heading itself carries no picture: its children are the text and the chip only.
  const heading = findElementTag(flat, 'h2');
  assert.notEqual(heading, undefined, 'the heading renders');
  const insideHeading = (heading!.props as { children?: ReactNode }).children;
  const inside = Array.isArray(insideHeading) ? insideHeading : [insideHeading];
  assert.equal(
    inside.map(node => pictureSrc(node)).find(src => src !== undefined),
    undefined,
    'no picture inside the heading'
  );
  // And the picture is present somewhere outside the heading. The block renders as a
  // fragment, so the check walks the whole tree and skips the heading subtree.
  const renderedPicture = pictureSrc(rendered);
  assert.notEqual(renderedPicture, undefined, 'the picture sits below the heading');
  // Nothing in the heading subtree actually loads a picture.
  assert.notEqual(inside.map(node => pictureSrc(node)).find(Boolean), renderedPicture);
});

test('a heading with no picture stays a single element', () => {
  const rendered = renderHeading('方案图：', 'docs/openapi.yaml', resolveWith(String.raw`C:\repo`));
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  // Only the heading: nothing was appended.
  assert.equal(flat.length, 1);
  assert.notEqual(findElementTag(flat, 'h2'), undefined);
});

/**
 * The first `display: block` box found inside an inline-only parent.
 *
 * Tag names do not tell the story: the break comes from a `span` the sheet styles
 * `display: block`, which is invalid inside `strong` / `em` / `del` / `a` — the browser
 * hoists it out of the paragraph and the sentence breaks. That is the same failure the
 * reader reported for headings.
 * @param nodes - the rendered tree.
 * @returns a description of the bad nesting, or undefined when the tree is clean.
 */
function blockInInline(nodes: ReactNode): string | undefined {
  const BLOCK_CLASSES = new Set(['mentionLine', 'mentionShot', 'headingShot']);
  const INLINE_ONLY = new Set(['strong', 'em', 'del', 'a']);
  const walk = (node: ReactNode, parent: string | undefined): string | undefined => {
    if (Array.isArray(node)) {
      for (const child of node) {
        const found = walk(child, parent);
        if (found !== undefined) return found;
      }
      return undefined;
    }
    if (!isValidElement(node)) return undefined;
    const tag = typeof node.type === 'string' ? node.type : undefined;
    if (typeof node.type === 'function' && !usesHooks(node.type)) {
      try {
        const expanded = (node.type as (props: unknown) => ReactNode)(node.props);
        const found = walk(expanded, parent);
        if (found !== undefined) return found;
      } catch {
        /* Fall through to children. */
      }
    }
    const className = String((node.props as { className?: string }).className ?? '');
    if (INLINE_ONLY.has(parent ?? '') && tag === 'span' && BLOCK_CLASSES.has(className)) {
      return `block span(.${className}) inside ${parent}`;
    }
    return walk((node.props as { children?: ReactNode }).children, tag ?? parent);
  };
  return walk(nodes, undefined);
}

/** A link whose text and destination name a picture, as an answer writes it. */
const pictureLink = {
  type: 'link',
  url: 'a.png',
  children: [{ type: 'text', value: 'a.png' }],
  position: { start: { offset: 0 }, end: { offset: 5 } }
};

/**
 * Render one paragraph with the given inline children.
 * @param children - the mdast inline children.
 * @returns every element the block rendered.
 */
function renderParagraph(children: unknown[]): ReactNode[] {
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children,
        position: { start: { offset: 0 }, end: { offset: 10 } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  return renderBlocks(blocks, context(resolveWith(String.raw`C:\repo`)));
}

test('a picture reference inside bold or italic stays inline', () => {
  // `**加粗 [图.png](图.png)**` puts the reference inside `strong`, an inline-only parent.
  // A block box there is invalid nesting: the browser hoists it out and the sentence
  // breaks, exactly as the heading case did.
  for (const kind of ['strong', 'emphasis', 'delete'] as const) {
    const rendered = renderParagraph([
      { type: kind, children: [{ type: 'text', value: '文字 ' }, pictureLink] }
    ]);
    assert.equal(blockInInline(rendered), undefined, `${kind} must not contain a block box`);
    // The picture is still shown, just inline.
    assert.notEqual(pictureSrc(rendered), undefined, `${kind} still shows the picture`);
  }
});

test('an inline-code picture mention inside bold stays inline', () => {
  const rendered = renderParagraph([
    {
      type: 'strong',
      children: [
        { type: 'text', value: '加粗 ' },
        {
          type: 'inlineCode',
          value: 'a.png',
          position: { start: { offset: 0 }, end: { offset: 5 } }
        }
      ]
    }
  ]);
  assert.equal(blockInInline(rendered), undefined);
});

test('a picture reference in a list item still takes its own line', () => {
  // `li` may hold block content, so the prose placement is kept there.
  const rendered = renderParagraph([pictureLink]);
  assert.equal(blockInInline(rendered), undefined);
  assert.notEqual(pictureSrc(rendered), undefined);
});

test('a file chip carries the destination in its tooltip, with no block beneath it', () => {
  // The reader asked for the name only: the destination belongs in the tooltip, not in a
  // block that pushes the sentence apart.
  const target = String.raw`G:\BE72PRO\router-backup\immortalwrt-sysupgrade.bin`;
  const rendered = renderFileLink('sysupgrade.bin', target, resolveWith(String.raw`C:\repo`));
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const button = findElementTag(flat, 'button');
  assert.notEqual(button, undefined, 'the chip is there');
  // With a mention the title comes from it; either way it names the file.
  const title = String((button!.props as { title?: string }).title ?? '');
  assert.match(title, /immortalwrt-sysupgrade\.bin/u, 'the tooltip names the file');
  // Nothing was added under the sentence.
  assert.equal(containsComponentNamed(rendered, 'PathBox'), false, 'no path block');
});

test('a path with no vocabulary still gets a chip', () => {
  // This is the case that shipped broken: the file is not in the turn's deliverables, so
  // `fileMentions.resolve` returns undefined. The chip must appear anyway.
  const target = String.raw`G:\BE72PRO\PY803\router-backup\x\sysupgrade.bin`;
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          { type: 'text', value: '记住固件位置：' },
          {
            type: 'link',
            url: target,
            children: [{ type: 'text', value: 'immortalwrt-…-sysupgrade.bin' }],
            position: { start: { offset: 0 }, end: { offset: 5 } }
          }
        ],
        position: { start: { offset: 0 }, end: { offset: 10 } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  const rendered = renderBlocks(blocks, {
    ...context(resolveWith(String.raw`C:\repo`)),
    fileMentions: undefined
  });
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));
  assert.equal(tags.includes('button'), true, 'the chip renders without the vocabulary');
  assert.equal(containsComponentNamed(rendered, 'FileGlyph'), true, 'and its icon with it');
});

test('the host decides a link is a file from the path, not from a deliverables list', () => {
  // The reader's real sentence linked to `G:\…\sysupgrade.bin`, a file the answer only
  // mentions. The file vocabulary knows nothing about it, so the link rendered as a plain
  // anchor: no chip, no icon, no path box. The Host's own renderer decides from the
  // destination alone, which is what `localFilePath` reproduces.
  assert.equal(
    localFilePath(String.raw`G:\BE72PRO\PY803\router-backup\x\sysupgrade.bin`),
    String.raw`G:\BE72PRO\PY803\router-backup\x\sysupgrade.bin`
  );
  assert.equal(localFilePath('docs/openapi.yaml'), 'docs/openapi.yaml');
  // A URL stays a link.
  assert.equal(localFilePath('https://example.com/a.png'), undefined);
  assert.equal(localFilePath('mailto:a@b.c'), undefined);
  // A line suffix is not part of the path; a UNC share is.
  assert.equal(localFilePath('C:\\x\\y.png:12'), 'C:\\x\\y.png');
  assert.equal(localFilePath(String.raw`\\host\share\a.bin`), String.raw`\\host\share\a.bin`);
});

test('a path with no vocabulary still gets a chip and its path box', () => {
  // This is the case that shipped broken: the file is not in the turn's deliverables, so
  // `fileMentions.resolve` returns undefined. The chip and box must appear anyway.
  const target = String.raw`G:\BE72PRO\PY803\router-backup\x\sysupgrade.bin`;
  const blocks = [
    {
      key: 0,
      node: {
        type: 'paragraph',
        children: [
          { type: 'text', value: '记住固件位置：' },
          {
            type: 'link',
            url: target,
            children: [{ type: 'text', value: 'immortalwrt-…-sysupgrade.bin' }],
            position: { start: { offset: 0 }, end: { offset: 5 } }
          }
        ],
        position: { start: { offset: 0 }, end: { offset: 10 } }
      }
    }
  ] as unknown as Parameters<typeof renderBlocks>[0];
  const rendered = renderBlocks(blocks, {
    ...context(resolveWith(String.raw`C:\repo`)),
    fileMentions: undefined
  });
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  const tags = flat.flatMap(node => renderedTags(node));
  assert.equal(tags.includes('button'), true, 'the chip renders without the vocabulary');
  assert.equal(containsComponentNamed(rendered, 'FileGlyph'), true, 'and its icon');
});

test('a URL link to a non-picture stays a plain anchor', () => {
  // The other side of the same rule: a URL that names no picture is not a file, so it
  // keeps its anchor and gains nothing.
  const rendered = renderLink('docs', 'https://example.com/docs', resolveWith(String.raw`C:\repo`));
  const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
  assert.equal(containsComponentNamed(rendered, 'PathBox'), false, 'no path box for a URL');
  assert.equal(findElementTag(flat, 'button'), undefined, 'no chip for a URL');
});

test('a bare file name stays code even when the vocabulary would match it', () => {
  // The case that shipped broken. The Host's vocabulary resolves a bare name, so this
  // turn writing `deliverables.ts` made every mention of it a chip. The original view
  // leaves it as code: a sentence naming a file in passing is not offering a link.
  //
  // All four combinations matter — with and without a vocabulary, bare name and full
  // path — and an earlier round only covered two of them, which is how the bug survived.
  const bare = 'deliverables.ts';
  const full = 'src/client/deliverables.ts';
  const vocabulary = (matchAs: string) => ({
    resolve: (value: string) =>
      value === matchAs ? { label: `打开 ${matchAs}`, title: full, open: () => {} } : undefined
  });

  const cases: { name: string; token: string; mentions: unknown; chip: boolean }[] = [
    // No vocabulary: nothing resolves, so no chip either way.
    { name: 'bare, no vocabulary', token: bare, mentions: undefined, chip: false },
    { name: 'path, no vocabulary', token: full, mentions: undefined, chip: false },
    // With a vocabulary that matches the bare name: still just code.
    { name: 'bare, vocabulary matches', token: bare, mentions: vocabulary(bare), chip: false },
    // With a vocabulary that matches the full path: a chip, because the token is a path.
    { name: 'path, vocabulary matches', token: full, mentions: vocabulary(full), chip: true }
  ];

  for (const testCase of cases) {
    const blocks = [
      {
        key: 0,
        node: {
          type: 'paragraph',
          children: [
            { type: 'text', value: '见 ' },
            { type: 'inlineCode', value: testCase.token, position: { start: { offset: 0 }, end: { offset: 5 } } }
          ],
          position: { start: { offset: 0 }, end: { offset: 9 } }
        }
      }
    ] as unknown as Parameters<typeof renderBlocks>[0];
    const rendered = renderBlocks(blocks, {
      ...context(resolveWith(String.raw`C:\repo`)),
      fileMentions: testCase.mentions as never
    });
    const flat = rendered.flatMap(node => (Array.isArray(node) ? node : [node]));
    const chip = findElementTag(flat, 'button') !== undefined;
    assert.equal(chip, testCase.chip, `${testCase.name}: chip=${String(testCase.chip)}`);
  }
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
