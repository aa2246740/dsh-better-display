import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { STREAM_TIMING, StreamBuffer } from './stream-buffer.js';
import { WORD_MOTION } from './word-timeline.js';

export const StreamMotionContext = createContext({ enabled: false, activatedAt: 0 });

export function useStreamingText(source: string, streaming: boolean, options: { startedAt?: number; interrupted: boolean; selected: boolean }) {
  const { enabled, activatedAt } = useContext(StreamMotionContext);
  const fresh = (options.startedAt ?? 0) >= activatedAt;
  const buffer = useRef<StreamBuffer>();
  if (!buffer.current) buffer.current = new StreamBuffer(enabled && streaming && fresh ? '' : source);
  const [display, setDisplay] = useState(() => ({ text: buffer.current!.visible, revision: 0 }));
  const [finalizing, setFinalizing] = useState(streaming);
  const frame = useRef(0);
  const immediate = !enabled || options.interrupted || options.selected;
  const publish = () => {
    const current = buffer.current!;
    setDisplay(previous => previous.text === current.visible && previous.revision === current.revision ? previous : { text: current.visible, revision: current.revision });
  };
  useLayoutEffect(() => {
    const current = buffer.current!;
    current.update(source, performance.now(), { immediate: immediate || document.hidden, finished: !streaming });
    publish();
    cancelAnimationFrame(frame.current);
    const tick = (now: number) => {
      if (document.hidden) current.flush();
      else current.advance(now);
      publish();
      if (current.pending) frame.current = requestAnimationFrame(tick);
    };
    if (current.pending) frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [source, streaming, immediate]);
  useEffect(() => {
    const hidden = () => {
      if (!document.hidden) return;
      cancelAnimationFrame(frame.current);
      buffer.current!.flush(); publish(); setFinalizing(false);
    };
    document.addEventListener('visibilitychange', hidden);
    return () => document.removeEventListener('visibilitychange', hidden);
  }, []);
  const pending = display.text !== source;
  useEffect(() => {
    if (streaming || pending) { setFinalizing(true); return; }
    if (immediate || document.hidden) { setFinalizing(false); return; }
    const timer = setTimeout(() => setFinalizing(false), WORD_MOTION.duration + WORD_MOTION.maxDelay);
    return () => clearTimeout(timer);
  }, [streaming, pending, immediate]);
  return { text: immediate ? source : display.text, pending: !immediate && pending, revision: display.revision, formatStreaming: streaming || (!immediate && (pending || finalizing)), reveal: enabled && !options.interrupted && !options.selected };
}
