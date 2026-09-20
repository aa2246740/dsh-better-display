/** Three-stop fold intensity persisted on `dsh.reader.v1`. Default is standard. */
export type FoldIntensity = 0 | 1 | 2;

export const FOLD_INTENSITY_DEFAULT: FoldIntensity = 1;

/** Level 0: nothing auto-folds. Level 1: current-main choreography. Level 2: process summaries. */
export function foldIntensityOf(state: unknown): FoldIntensity {
  const rec = state && typeof state === 'object' ? state as Record<string, unknown> : {};
  if (rec.foldIntensity === 0 || rec.foldIntensity === 1 || rec.foldIntensity === 2) return rec.foldIntensity;
  if (rec.processOnly === true) return 2;
  if (rec.autoFold === false) return 0;
  return FOLD_INTENSITY_DEFAULT;
}

/** Name the tools a fold contains instead of only counting them. Default off. */
export function keepToolSemanticsOf(state: unknown): boolean {
  return (state as { keepToolSemantics?: unknown } | null)?.keepToolSemantics === true;
}

export function frostedGlassOf(state: unknown): boolean {
  if (state && typeof state === 'object' && 'frostedGlass' in state) {
    return (state as { frostedGlass?: unknown }).frostedGlass === true;
  }
  return state === true;
}

export function autoFoldFromIntensity(intensity: FoldIntensity): boolean {
  return intensity !== 0;
}

export function processOnlyFromIntensity(intensity: FoldIntensity): boolean {
  return intensity === 2;
}

/**
 * Keep the model's user-facing answer text out of the fold.
 *
 * This is deliberately a separate switch rather than a fourth stop on
 * `foldIntensity`: it answers a different question. The three stops decide
 * *how much* process to fold; this decides *whether prose is foldable at all*.
 * Wiring it into the slider would make it impossible to ask for a summary-level
 * fold that still keeps every explanation visible, and it would silently change
 * the meaning of a stop that existing users already rely on.
 *
 * Default off, so nothing moves for anyone who does not ask for it.
 */
export function keepProseOf(state: unknown): boolean {
  if (state && typeof state === 'object' && 'keepProse' in state) {
    return (state as { keepProse?: unknown }).keepProse === true;
  }
  return false;
}
