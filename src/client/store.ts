import { defineStore } from '@deepseek-ai/dsh-client-store';
import type { EngineStoreHandle } from '@deepseek-ai/dsh-client-store';
import {
  FOLD_INTENSITY_DEFAULT,
  autoFoldFromIntensity,
  processOnlyFromIntensity,
  keepProseOf,
  type FoldIntensity,
} from './fold-intensity.js';
import type { DeliverableOpenMode } from './open-file.js';

export interface ReaderState {
  expanded: Record<string, boolean>;
  motion: boolean;
  /** Derived from foldIntensity; kept so older persisted snapshots still read. */
  autoFold: boolean;
  /** Default stays the system app. `sidebar` is opt-in. */
  deliverableOpenMode: DeliverableOpenMode;
  /**
   * 0 = no auto-fold, 1 = current-main fold-on-next-reasoning (default),
   * 2 = process-summary mode from community PR #14.
   */
  foldIntensity: FoldIntensity;
  /** Translucent frosted chrome. Default off so opaque main chrome stays. */
  frostedGlass: boolean;
  /**
   * Keep the model's user-facing answer text out of the fold. Orthogonal to
   * foldIntensity, which only decides how much process to fold. Default off.
   */
  keepProse: boolean;
  /** Derived from foldIntensity === 2; kept for older #14 snapshots. */
  processOnly: boolean;
  /**
   * Name the tools a fold contains instead of only counting them. Opt-in:
   * `工具×22` says how much was hidden, this says what it was. Default off.
   */
  keepToolSemantics: boolean;
}
type ReaderActions = {
  setExpanded: (draft: ReaderState, key: string, value: boolean) => void;
  resetExpanded: (draft: ReaderState) => void;
  setMotion: (draft: ReaderState, value: boolean) => void;
  setAutoFold: (draft: ReaderState, value: boolean) => void;
  setDeliverableOpenMode: (draft: ReaderState, value: DeliverableOpenMode) => void;
  setFoldIntensity: (draft: ReaderState, value: FoldIntensity) => void;
  setFrostedGlass: (draft: ReaderState, value: boolean) => void;
  setKeepProse: (draft: ReaderState, value: boolean) => void;
  setKeepToolSemantics: (draft: ReaderState, value: boolean) => void;
};

function applyFoldIntensity(draft: ReaderState, value: FoldIntensity): void {
  draft.foldIntensity = value;
  draft.autoFold = autoFoldFromIntensity(value);
  draft.processOnly = processOnlyFromIntensity(value);
}

export function createReaderStore(): EngineStoreHandle<ReaderState, ReaderActions> {
  return defineStore({
    init: (): ReaderState => ({
      expanded: {},
      motion: true,
      autoFold: true,
      deliverableOpenMode: 'external',
      foldIntensity: FOLD_INTENSITY_DEFAULT,
      frostedGlass: false,
      keepProse: keepProseOf(undefined),
      keepToolSemantics: false,
      processOnly: false,
    }),
    persist: 'dsh.reader.v1',
    actions: {
      setExpanded: (draft, key: string, value: boolean) => { draft.expanded[key] = value; },
      resetExpanded: draft => { draft.expanded = {}; },
      setMotion: (draft, value: boolean) => { draft.motion = value; },
      setAutoFold: (draft, value: boolean) => {
        applyFoldIntensity(draft, value
          ? (draft.foldIntensity === 2 ? 2 : 1)
          : 0);
      },
      setDeliverableOpenMode: (draft, value: DeliverableOpenMode) => { draft.deliverableOpenMode = value; },
      setFoldIntensity: (draft, value: FoldIntensity) => { applyFoldIntensity(draft, value); },
      setFrostedGlass: (draft, value: boolean) => { draft.frostedGlass = value; },
      setKeepProse: (draft, value: boolean) => { draft.keepProse = value; },
      setKeepToolSemantics: (draft, value: boolean) => { draft.keepToolSemantics = value; },
    },
  });
}
