import { useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import { ProcessFragment } from './motion.js';
import css from './Reader.module.css';

export function PriorChainFold({ summary, motion, onRead, processKey, children }: {
  summary: string; motion: boolean; onRead: () => void; processKey: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const controls = useId();
  const button = useRef<HTMLButtonElement>(null);
  const expand = () => {
    onRead();
    setOpen(true);
  };
  return <div className={css.priorFold} data-reader-live-fold data-expanded={open} data-reader-live-fold-summary={summary}>
    <button ref={button} type="button" className={css.priorFoldButton} aria-expanded={open} aria-controls={controls}
      aria-label={`${open ? '收起' : '展开'}此前步骤，${summary}`} onClick={() => { onRead(); setOpen(value => !value); }}>
      <span className={css.priorFoldCopy}>
        <span className={css.priorFoldLabel}>此前步骤</span>
        <span className={css.priorFoldCounts}>{summary}</span>
      </span>
      <svg className={css.chevron} data-open={open} viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m6 4 4 4-4 4" /></svg>
    </button>
    <ProcessFragment open={open} motion={motion} onRead={expand} returnFocusTo={button as RefObject<HTMLElement>} nodeKey={processKey} framed>
      <div id={controls} className={css.priorFoldBody} data-reader-live-fold-body>{children}</div>
    </ProcessFragment>
  </div>;
}
