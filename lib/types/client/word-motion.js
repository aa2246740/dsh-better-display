import { jsx as _jsx } from "react/jsx-runtime";
import { createContext, useContext, useLayoutEffect, useMemo, useRef } from 'react';
import { MarkdownText } from './markdown/MarkdownText.js';
import { readerPathImagesFor } from './platform-media.js';
import { WORD_MOTION, WordTimeline } from './word-timeline.js';
import css from './Reader.module.css';
const WordScope = createContext({ enabled: false, generation: 0 });
const CODE_LABELS = { copyLabel: '复制代码', copiedLabel: '已复制' };
function useSourceReveal(element, born, generation) {
    const scope = useContext(WordScope);
    const cancelled = useRef(false);
    useLayoutEffect(() => {
        const target = element.current;
        if (!target)
            return;
        target.dataset.wordState = 'settled';
        if (!scope.enabled || scope.generation !== generation) {
            cancelled.current = true;
            return;
        }
        if (cancelled.current || born === null || document.hidden)
            return;
        const age = Number(document.timeline.currentTime ?? performance.now()) - born;
        if (age >= WORD_MOTION.duration || typeof target.animate !== 'function')
            return;
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
        const hidden = () => { if (document.hidden) {
            cancelled.current = true;
            finish();
        } };
        document.addEventListener('visibilitychange', hidden);
        return () => { animation.cancel(); document.removeEventListener('visibilitychange', hidden); target.dataset.wordState = 'settled'; };
    }, [element, born, generation, scope.enabled, scope.generation]);
}
function Word({ children, born, generation, offset, inline }) {
    const element = useRef(null);
    useSourceReveal(element, born, generation);
    return _jsx("span", { ref: element, className: inline ? css.streamInlineWord : css.streamWord, "data-reader-word": true, "data-source-start": offset, "data-source-birth": born ?? undefined, children: children });
}
/** A native code block enters on the same clock, without rebuilding its text. */
function MotionAtom({ children, born, generation, offset }) {
    const element = useRef(null);
    useSourceReveal(element, born, generation);
    return _jsx("div", { ref: element, className: css.streamAtom, "data-reader-atom": true, "data-source-start": offset, "data-source-birth": born ?? undefined, children: children });
}
/** Native Think is literal text, not Markdown. Spans never alter its bytes. */
export function MotionPlainText({ text, enabled, revision }) {
    const timeline = useRef();
    timeline.current ??= new WordTimeline();
    timeline.current.begin(text, enabled, revision, Number(document.timeline.currentTime ?? performance.now()));
    const current = timeline.current;
    const generation = current.generation;
    const scope = useMemo(() => ({ enabled, generation }), [enabled, generation]);
    return _jsx(WordScope.Provider, { value: scope, children: _jsx("div", { className: css.reasonPlain, children: current.hasLiveText ? current.words(text, 0).map(word => word.text.trim()
                ? _jsx(Word, { born: word.born, generation: generation, offset: word.key, inline: true, children: word.text }, word.key)
                : word.text) : text }) });
}
/** Native DSH Markdown semantics with a stable text-leaf animation hook. */
export function MotionMarkdown({ text, streaming, enabled, revision, fileMentions, cwd }) {
    const timeline = useRef();
    timeline.current ??= new WordTimeline();
    timeline.current.begin(text, enabled, revision, Number(document.timeline.currentTime ?? performance.now()));
    const generation = timeline.current.generation;
    const scope = useMemo(() => ({ enabled, generation }), [enabled, generation]);
    // A new identity discards the streaming render cache, so bind it to cwd
    // rather than rebuilding it on every chunk.
    const pathImages = useMemo(() => readerPathImagesFor(cwd), [cwd]);
    const renderText = useMemo(() => (value, offset, inline = false) => {
        const current = timeline.current;
        if (!current.hasLiveText)
            return value;
        return current.words(value, offset).map(word => word.text.trim()
            ? _jsx(Word, { born: word.born, generation: current.generation, offset: word.key, inline: inline || /^\p{P}+$/u.test(word.text), children: word.text }, word.key)
            : word.text);
    }, []);
    const renderAtom = useMemo(() => (children, offset) => {
        const current = timeline.current;
        return current.hasLiveText ? _jsx(MotionAtom, { born: current.bornAt(offset), generation: current.generation, offset: offset, children: children }) : children;
    }, []);
    return _jsx(WordScope.Provider, { value: scope, children: _jsx(MarkdownText, { text: text, streaming: streaming, codeLabels: CODE_LABELS, fileMentions: fileMentions, pathImages: pathImages, renderText: renderText, renderAtom: renderAtom }) });
}
//# sourceMappingURL=word-motion.js.map