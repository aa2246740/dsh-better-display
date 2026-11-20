import assert from 'node:assert/strict';
import { test } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/client/motion.tsx', import.meta.url), 'utf8');
const retiring = source.slice(source.indexOf('export function RetiringContent('), source.indexOf('// DOM-only behavior:'));
const compiled = ts.transpileModule(`const EASING = 'cubic-bezier(.22,1,.36,1)';\n${retiring}`, {
  fileName: 'retiring.tsx',
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX },
}).outputText;

// Drive the component's real effect with deterministic hooks and a compositor
// that never finishes unless the test explicitly sends onfinish.
function mount(options?: { containsFocus?: boolean; hidden?: boolean }) {
  let cursor = 0;
  let enabled = true;
  const hooks: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let pending: Array<{ index: number; run: () => (() => void) | void; deps: unknown[] }> = [];
  let timerId = 0;
  const timers = new Map<number, { run: () => void; duration: number }>();
  const animations: Array<{ onfinish?: () => void; cancelled: number }> = [];
  const cutFocus = { id: 'focus-cut' };
  const outside = { id: 'outside' };
  const listeners = new Set<() => void>();
  const column = {
    id: 'reader-column',
    tabIndex: -1,
    focus() { page.active = column; },
  };
  const page = {
    hidden: options?.hidden ?? false,
    active: (options?.containsFocus ? cutFocus : null) as { id: string } | null,
  };
  const element = {
    contains: (node: unknown) => node === cutFocus,
    closest: (selector: string) => selector === '[data-chat-flow]' ? column : null,
    parentElement: null,
    getBoundingClientRect: () => ({ height: 64 }),
    animate: (_frames: unknown, options: { duration: number; fill: string }) => {
      assert.equal(options.duration, 220);
      assert.equal(options.fill, 'both');
      const animation = { cancelled: 0, cancel() { this.cancelled++; } };
      animations.push(animation);
      return animation;
    },
  };
  const effect = (run: () => (() => void) | void, deps: unknown[]) => {
    const index = cursor++;
    const previous = effects.get(index);
    if (!previous || deps.some((value, at) => value !== previous.deps[at])) pending.push({ index, run, deps });
  };
  const exports: { RetiringContent?: (props: { visible: boolean; children: string }) => unknown } = {};
  runInNewContext(compiled, {
    exports,
    require: createRequire(import.meta.url),
    css: { retiringContent: 'retiring' },
    StreamMotionContext: {},
    // Declared above the sliced component; it only needs a Provider type here.
    RetiringTurnContext: { Provider: 'RetiringTurnContext.Provider' },
    HTMLElement: globalThis.HTMLElement,
    Element: globalThis.Element,
    document: {
      get activeElement() { return page.active; },
      get hidden() { return page.hidden; },
      addEventListener: (type: string, listener: () => void) => { if (type === 'visibilitychange') listeners.add(listener); },
      removeEventListener: (type: string, listener: () => void) => { if (type === 'visibilitychange') listeners.delete(listener); },
    },
    window: {
      setTimeout: (run: () => void, duration: number) => { timers.set(++timerId, { run, duration }); return timerId; },
      clearTimeout: (id: number) => { timers.delete(id); },
    },
    useContext: () => ({ enabled }),
    useRef: (initial: unknown) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current: initial };
      return hooks[index];
    },
    useState: (initial: unknown) => {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = initial;
      return [hooks[index], (value: unknown) => { hooks[index] = value; }];
    },
    useLayoutEffect: effect,
    useEffect: effect,
  });
  assert.equal(typeof exports.RetiringContent, 'function');
  type Rendered = { ref: { current: unknown }; props: { onBlur: (event: unknown) => void } };
  let last: Rendered | null = null;
  const render = (visible: boolean) => {
    cursor = 0;
    pending = [];
    const result = exports.RetiringContent!({ visible, children: 'narration' }) as Rendered | null;
    last = result;
    if (result) result.ref.current = element;
    for (const { index, run, deps } of pending) {
      effects.get(index)?.cleanup?.();
      effects.set(index, { deps, cleanup: run() ?? undefined });
    }
    return result;
  };
  render(true);
  return {
    render, timers, animations, listeners,
    focusId: () => page.active?.id ?? '',
    // Move focus out of the cut the way a real blur reports it.
    blur: () => {
      page.active = outside;
      last?.props.onBlur({ currentTarget: element, relatedTarget: outside });
    },
    hide: () => {
      page.hidden = true;
      for (const listener of [...listeners]) listener();
    },
    disableMotion: () => { enabled = false; },
    unmount: () => { for (const effect of effects.values()) effect.cleanup?.(); },
    deadline: () => {
      const [id, timer] = [...timers][0] ?? [];
      assert.ok(timer, 'retiring animation must have a deadline');
      assert.equal(timer.duration, 460);
      timers.delete(id);
      timer.run();
    },
  };
}

test('retiring narration unmounts on its deadline when onfinish never fires', () => {
  const view = mount();
  assert.ok(view.render(false));
  view.deadline();
  assert.equal(view.animations[0].cancelled, 1);
  assert.equal(view.render(false), null);
  view.unmount();
});

test('normal finish settles once and removes the deadline on cleanup', () => {
  const view = mount();
  view.render(false);
  view.animations[0].onfinish?.();
  view.animations[0].onfinish?.();
  assert.equal(view.animations[0].cancelled, 1);
  assert.equal(view.render(false), null);
  view.unmount();
  assert.equal(view.timers.size, 0);
});

test('visibility reversal and unmount cancel the deadline and release animation fill', () => {
  const view = mount();
  view.render(false);
  const staleFinish = view.animations[0].onfinish;
  assert.ok(view.render(true));
  assert.equal(view.timers.size, 0);
  assert.equal(view.animations[0].cancelled, 1);
  staleFinish?.();
  assert.ok(view.render(true));
  view.render(false);
  view.unmount();
  assert.equal(view.timers.size, 0);
  assert.equal(view.animations[1].cancelled, 1);
});

test('disabled motion retires immediately without an animation or timer', () => {
  const view = mount();
  view.disableMotion();
  view.render(false);
  assert.equal(view.render(false), null);
  assert.equal(view.animations.length, 0);
  assert.equal(view.timers.size, 0);
  view.unmount();
});

test('reduced motion moves focus out of cut content before it unmounts', () => {
  const reduced = mount({ containsFocus: true });
  reduced.disableMotion();
  reduced.render(false);
  assert.equal(reduced.render(false), null);
  assert.equal(reduced.focusId(), 'reader-column');
  assert.equal(reduced.animations.length, 0);
  reduced.unmount();

  const hidden = mount({ containsFocus: true, hidden: true });
  hidden.render(false);
  assert.equal(hidden.render(false), null);
  assert.equal(hidden.focusId(), 'reader-column');
  assert.equal(hidden.animations.length, 0);
  hidden.unmount();

  // The animated path still defers while focus is inside the cut.
  const playing = mount({ containsFocus: true });
  assert.ok(playing.render(false));
  assert.equal(playing.focusId(), 'focus-cut');
  assert.equal(playing.animations.length, 0);
  playing.unmount();
});

test('a page hidden while focus defers the collapse retires at once and keeps focus', () => {
  const view = mount({ containsFocus: true });
  assert.ok(view.render(false));
  // The focus-held state re-runs the effect; it must keep waiting, not animate.
  assert.ok(view.render(false));
  assert.equal(view.focusId(), 'focus-cut');
  assert.equal(view.animations.length, 0);
  assert.equal(view.listeners.size, 1, 'the focus-held path still listens for a hidden page');
  view.hide();
  assert.equal(view.render(false), null);
  assert.equal(view.focusId(), 'reader-column');
  assert.equal(view.animations.length, 0);
  assert.equal(view.timers.size, 0);
  view.unmount();
  assert.equal(view.listeners.size, 0);
});

test('focus leaving the cut still plays the collapse, bounded by its deadline', () => {
  const view = mount({ containsFocus: true });
  view.render(false);
  view.render(false);
  assert.equal(view.animations.length, 0);
  view.blur();
  assert.ok(view.render(false));
  assert.equal(view.animations.length, 1);
  assert.equal(view.listeners.size, 1);
  view.deadline();
  assert.equal(view.render(false), null);
  assert.equal(view.focusId(), 'outside');
  view.unmount();
  assert.equal(view.listeners.size, 0);
  assert.equal(view.timers.size, 0);
});
