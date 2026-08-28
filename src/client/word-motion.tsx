import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';
import { MarkdownText } from './markdown/MarkdownText.js';
import { WORD_MOTION, WordTimeline } from './word-timeline.js';
import css from './Reader.module.css';

const WordScope = createContext({ enabled: false, generation: 0 });
const CODE_LABELS = { copyLabel: '复制代码', copiedLabel: '已复制' };

function useSourceReveal(element: RefObject<HTMLElement>, born: number | null, generation: number) {
  const scope = useContext(WordScope);
  const cancelled = useRef(false);
  useLayoutEffect(() => {
    const target = element.current;
    if (!target) return;
    target.dataset.wordState = 'settled';
    if (!scope.enabled || scope.generation !== generation) { cancelled.current = true; return; }
    if (cancelled.current || born === null || document.hidden) return;
    const age = Number(document.timeline.currentTime ?? performance.now()) - born;
    if (age >= WORD_MOTION.duration || typeof target.animate !== 'function') return;
    // The reference opacity + blur frames, applied only to this new word.
    // No color interpolation, stylesheet mutation, or whole-paragraph wipe.
    const animation = target.animate([
      { opacity: 0, filter: `blur(${WORD_MOTION.blur}px)` },
      { opacity: 1, filter: 'blur(0px)' },
    ], { duration: WORD_MOTION.duration, easing: WORD_MOTION.easing, fill: 'backwards' });
    // One absolute clock prevents newly mounted/resegmented leaves from getting
    // a fresh delay or running ahead because their layout effects ran later.
    animation.startTime = born;
    target.dataset.wordState = 'resolving';
    const finish = () => { animation.cancel(); target.dataset.wordState = 'settled'; document.removeEventListener('visibilitychange', hidden); };
    animation.onfinish = finish;
    const hidden = () => { if (document.hidden) { cancelled.current = true; finish(); } };
    document.addEventListener('visibilitychange', hidden);
    return () => { animation.cancel(); document.removeEventListener('visibilitychange', hidden); target.dataset.wordState = 'settled'; };
  }, [element, born, generation, scope.enabled, scope.generation]);
}

function Word({ children, born, generation, offset, inline }: { children: string; born: number | null; generation: number; offset: number; inline: boolean }) {
  const element = useRef<HTMLSpanElement>(null);
  useSourceReveal(element, born, generation);
  return <span ref={element} className={inline ? css.streamInlineWord : css.streamWord} data-reader-word data-source-start={offset} data-source-birth={born ?? undefined}>{children}</span>;
}

/** A native code block enters on the same clock, without rebuilding its text. */
function MotionAtom({ children, born, generation, offset }: { children: ReactNode; born: number | null; generation: number; offset: number }) {
  const element = useRef<HTMLDivElement>(null);
  useSourceReveal(element, born, generation);
  return <div ref={element} className={css.streamAtom} data-reader-atom data-source-start={offset} data-source-birth={born ?? undefined}>{children}</div>;
}

/** Native Think is literal text, not Markdown. Spans never alter its bytes. */
export function MotionPlainText({ text, enabled, revision }: { text: string; enabled: boolean; revision: number }) {
  const timeline = useRef<WordTimeline>();
  timeline.current ??= new WordTimeline();
  timeline.current.begin(text, enabled, revision, Number(document.timeline.currentTime ?? performance.now()));
  const current = timeline.current;
  const generation = current.generation;
  const scope = useMemo(() => ({ enabled, generation }), [enabled, generation]);
  return <WordScope.Provider value={scope}><div className={css.reasonPlain}>
    {current.hasLiveText ? current.words(text, 0).map(word => word.text.trim()
      ? <Word key={word.key} born={word.born} generation={generation} offset={word.key} inline>{word.text}</Word>
      : word.text) : text}
  </div></WordScope.Provider>;
}

/** Native DSH Markdown semantics with a stable text-leaf animation hook. */
export function MotionMarkdown({ text, streaming, enabled, revision }: { text: string; streaming: boolean; enabled: boolean; revision: number }) {
  const timeline = useRef<WordTimeline>();
  timeline.current ??= new WordTimeline();
  timeline.current.begin(text, enabled, revision, Number(document.timeline.currentTime ?? performance.now()));
  const generation = timeline.current.generation;
  const scope = useMemo(() => ({ enabled, generation }), [enabled, generation]);
  const renderText = useMemo(() => (value: string, offset: number, inline = false): ReactNode => {
    const current = timeline.current!;
    if (!current.hasLiveText) return value;
    return current.words(value, offset).map(word => word.text.trim()
      ? <Word key={word.key} born={word.born} generation={current.generation} offset={word.key} inline={inline || /^\p{P}+$/u.test(word.text)}>{word.text}</Word>
      : word.text);
  }, []);
  const renderAtom = useMemo(() => (children: ReactNode, offset: number): ReactNode => {
    const current = timeline.current!;
    return current.hasLiveText ? <MotionAtom born={current.bornAt(offset)} generation={current.generation} offset={offset}>{children}</MotionAtom> : children;
  }, []);
  return <WordScope.Provider value={scope}>
    <MarkdownText text={text} streaming={streaming} codeLabels={CODE_LABELS} renderText={renderText} renderAtom={renderAtom} />
  </WordScope.Provider>;
}
