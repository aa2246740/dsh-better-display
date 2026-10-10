import assert from 'node:assert/strict';
import { test } from 'node:test';
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
function mount() {
  let cursor = 0;
  let enabled = true;
  const hooks: unknown[] = [];
  const effects = new Map<number, { deps: unknown[]; cleanup?: () => void }>();
  let pending: Array<{ index: number; run: () => (() => void) | void; deps: unknown[] }> = [];
  let timerId = 0;
  const timers = new Map<number, { run: () => void; duration: number }>();
  const animations: Array<{ onfinish?: () => void; cancelled: number }> = [];
  const element = {
    contains: () => false,
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
    document: { activeElement: null },
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
  const render = (visible: boolean) => {
    cursor = 0;
    pending = [];
    const result = exports.RetiringContent!({ visible, children: 'narration' }) as { ref: { current: unknown } } | null;
    if (result) result.ref.current = element;
    for (const { index, run, deps } of pending) {
      effects.get(index)?.cleanup?.();
      effects.set(index, { deps, cleanup: run() ?? undefined });
    }
    return result;
  };
  render(true);
  return {
    render, timers, animations,
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
