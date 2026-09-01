import { useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Disclosure, ProcessFragment, StatusText } from './motion.js';

/** Prior-chain control on the live process stack: same Disclosure / StatusText
 *  / ProcessFragment paths as the 阅读 tab, not a parallel fold box. */
export function PriorChainFold({ summary, motion, foldOpen, onFoldOpenChange, processKey, processOpen, onRead, returnFocusTo }: {
  summary: string;
  motion: boolean;
  foldOpen: boolean;
  onFoldOpenChange: (value: boolean) => void;
  processKey: string;
  processOpen: boolean;
  onRead: () => void;
  returnFocusTo: RefObject<HTMLElement>;
}) {
  // Mount closed so the header uses the same 0→auto process-open path as a
  // newly disclosed process fragment, instead of popping in at full height.
  const [headerOpen, setHeaderOpen] = useState(false);
  useLayoutEffect(() => { setHeaderOpen(processOpen); }, [processOpen]);
  const button = useRef<HTMLButtonElement>(null);
  return <ProcessFragment open={headerOpen} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={processKey} framed>
    <div data-reader-live-fold data-expanded={foldOpen} data-reader-live-fold-summary={summary}>
      <Disclosure open={foldOpen} onChange={value => { onRead(); onFoldOpenChange(value); }} buttonRef={button}
        ariaLabel="此前步骤" showMeta={false} label={<StatusText text={summary} motion={motion} />} />
    </div>
  </ProcessFragment>;
}
