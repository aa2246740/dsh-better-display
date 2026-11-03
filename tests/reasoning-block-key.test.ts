import assert from 'node:assert/strict';
import type { ReactElement, ReactNode } from 'react';
import { test, vi } from 'vitest';
import { Blocks } from '../src/client/Blocks.js';
import type { BlockRenderProps } from '../src/client/types.js';
import {
  createTextTransformRegistry,
  installTextTransformRegistry,
  type DisplayTextRequest,
} from '../src/client/text-transform.js';

// Inspect the real component paths without a browser or Harness runtime. The
// fixed useId represents one mounted Blocks instance, not a remount test.
vi.mock('react', async importOriginal => {
  const react = await importOriginal<typeof import('react')>();
  return {
    ...react,
    useId: () => ':opaque-mounted-reader:',
    useEffect: () => {},
    useMemo: (factory: () => unknown) => factory(),
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
  };
});
vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  JsonBlock: () => null, MarkdownText: () => null, writeClipboard: vi.fn(),
}));
vi.mock('../src/client/streaming.js', () => ({
  useStreamingText: (text: string) => ({ text, pending: false, reveal: false, revision: 0 }),
}));
vi.mock('../src/client/word-motion.js', () => ({
  MotionMarkdown: () => null, MotionPlainText: () => null,
}));
vi.mock('../src/client/McpAppFrame.js', async () => {
  const { createContext } = await import('react');
  return { ComposerFillContext: createContext(undefined), McpAppFrame: () => null };
});
vi.mock('../src/client/TurnMetrics.js', () => ({ TurnMetrics: () => null }));

type Element = ReactElement<Record<string, unknown>>;
type ReasoningBlock = { readonly kind: 'reasoning'; readonly text: string };

function reasoningRoots(blocks: readonly ReasoningBlock[], streaming = false): Element[] {
  const roots: Element[] = [];
  const renderSlotChain = ((_name: string, _owner: unknown, options: { fallback: ReactNode }) => {
    let element = options.fallback as Element;
    // ReadingReasoning -> [TransformedReasoning ->] ReasoningStream -> div.
    while (typeof element.type === 'function') {
      element = (element.type as (props: Record<string, unknown>) => Element)(element.props);
    }
    assert.equal(element.type, 'div');
    assert.equal(element.props['data-reader-text-kind'], 'reasoning');
    roots.push(element);
    return element;
  }) as BlockRenderProps['renderSlotChain'];
  const renderBlocks = (Blocks as unknown as { type: (props: unknown) => ReactNode }).type;
  renderBlocks({ blocks, streaming, renderSlotChain });
  return roots;
}

const marker = (root: Element) => root.props['data-reader-reasoning-block-key'];
const shownText = (root: Element) => (root.props.children as Element).props.text;

for (const mode of ['no registry', 'body only', 'translated', 'original fallback'] as const) {
  test(`reasoning roots retain their own opaque keys and source text: ${mode}`, () => {
    const registry = mode === 'no registry' ? undefined : createTextTransformRegistry();
    const requests: DisplayTextRequest[] = [];
    if (mode === 'body only') registry!.register('body', { read: () => 'unused body transform' });
    if (mode === 'translated' || mode === 'original fallback') {
      registry!.register('reasoning', {
        read(request) {
          requests.push(request);
          return mode === 'translated' ? 'translated display' : undefined;
        },
      });
    }
    const restore = installTextTransformRegistry(registry);
    const blocks = Object.freeze([
      Object.freeze({ kind: 'reasoning' as const, text: 'identical original' }),
      Object.freeze({ kind: 'reasoning' as const, text: 'identical original' }),
    ]);
    try {
      const roots = reasoningRoots(blocks);
      const keys = roots.map(marker);
      assert.equal(keys.length, 2);
      assert.ok(keys.every(key => typeof key === 'string' && key.length > 0));
      assert.equal(new Set(keys).size, 2, 'identical text must not merge block ownership');
      assert.deepEqual(roots.map(shownText), [
        mode === 'translated' ? 'translated display' : 'identical original',
        mode === 'translated' ? 'translated display' : 'identical original',
      ]);
      assert.equal(requests.length, mode === 'translated' || mode === 'original fallback' ? 2 : 0);
      if (requests.length) {
        assert.deepEqual(requests.map(request => request.blockKey), keys);
        assert.ok(requests.every(request => request.text === 'identical original'));
      }
      assert.deepEqual(blocks.map(block => block.text), ['identical original', 'identical original']);
      const grown = reasoningRoots(blocks.map(block => ({ ...block, text: `${block.text} grows` })), true);
      assert.deepEqual(grown.map(marker), keys, 'streaming growth must preserve each mounted block key');
    } finally {
      restore();
    }
  });
}

test('marker keeps the existing mounted key across source growth, translated display and original override', () => {
  const registry = createTextTransformRegistry();
  const requests: DisplayTextRequest[] = [];
  let original = false;
  registry.register('reasoning', {
    read(request) {
      requests.push(request);
      return original ? undefined : { text: `translated: ${request.text}`, final: !request.streaming };
    },
  });
  const restore = installTextTransformRegistry(registry);
  try {
    const first = reasoningRoots([{ kind: 'reasoning', text: 'hello' }], true)[0];
    const grown = reasoningRoots([{ kind: 'reasoning', text: 'hello world' }], true)[0];
    original = true;
    const settled = reasoningRoots([{ kind: 'reasoning', text: 'hello world' }])[0];
    assert.deepEqual([marker(grown), marker(settled)], [marker(first), marker(first)]);
    assert.deepEqual(requests.map(request => request.blockKey), [marker(first), marker(first), marker(first)]);
    assert.equal(shownText(first), 'translated: hello');
    assert.equal(shownText(grown), 'translated: hello world');
    assert.equal(shownText(settled), 'hello world');
  } finally {
    restore();
  }
});
