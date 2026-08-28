/** Presentation only. The original session string remains the source of truth. */
export const STREAM_TIMING = { catchUpMs: 180, maxQueuedMs: 240, finishMs: 96, revealMs: 350, minimumRate: 100 } as const;
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function atOrAfter(values: readonly number[], target: number): number {
  let low = 0;
  let high = values.length - 1;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < target) low = middle + 1;
    else high = middle;
  }
  return low;
}

export class StreamBuffer {
  target: string;
  visible: string;
  revision = 0;
  private boundaries = [0];
  private arrivals: { end: number; at: number }[] = [];
  private lastAt: number | null = null;
  private credit = 0;
  private finishAt: number | null = null;

  constructor(initial = '') {
    this.target = initial;
    this.visible = initial;
    this.segment(0);
  }

  get pending(): boolean { return this.visible.length < this.target.length; }

  private segment(from: number): void {
    const index = atOrAfter(this.boundaries, from);
    this.boundaries.length = index;
    for (const part of graphemes.segment(this.target.slice(from))) this.boundaries.push(from + part.index);
    if (this.boundaries.at(-1) !== this.target.length) this.boundaries.push(this.target.length);
  }

  /** Non-append updates, cancellations and hidden/reduced views never replay. */
  update(text: string, now: number, options: { immediate?: boolean; finished?: boolean } = {}): void {
    if (options.immediate || !text.startsWith(this.target)) {
      if (text !== this.target) this.revision++;
      this.target = text;
      this.flush();
      this.boundaries = [0];
      this.segment(0);
      return;
    }
    if (text !== this.target) {
      const wasPending = this.pending;
      const from = this.boundaries.at(-2) ?? 0;
      this.target = text;
      // Re-segment the previous last cluster: an emoji/combining sequence can
      // itself span transport chunks. Frozen source prefixes are not scanned.
      this.segment(from);
      this.arrivals.push({ end: text.length, at: now });
      if (!wasPending) { this.lastAt = now; this.credit = 0; }
    }
    if (options.finished && this.finishAt === null) this.finishAt = now + STREAM_TIMING.finishMs;
    if (!options.finished) this.finishAt = null;
    if (this.target.length - this.visible.length > 8192) { this.revision++; this.flush(); }
  }

  flush(): void {
    this.visible = this.target;
    this.arrivals = [];
    this.credit = 0;
    this.lastAt = null;
    this.finishAt = null;
  }

  advance(now: number): boolean {
    if (!this.pending) return false;
    const before = this.visible.length;
    const index = atOrAfter(this.boundaries, before);
    const remaining = this.boundaries.length - index - 1;
    const delta = Math.max(0, now - (this.lastAt ?? now));
    this.lastAt = now;
    const windowMs = this.finishAt === null ? STREAM_TIMING.catchUpMs : Math.max(16, Math.min(STREAM_TIMING.catchUpMs, this.finishAt - now));
    const rate = Math.max(STREAM_TIMING.minimumRate, remaining * 1000 / windowMs);
    this.credit += rate * delta / 1000;
    const count = Math.floor(this.credit);
    this.credit -= count;
    let end = this.boundaries[Math.min(this.boundaries.length - 1, index + count)]!;
    for (const item of this.arrivals) {
      if (now - item.at < STREAM_TIMING.maxQueuedMs) break;
      end = Math.max(end, this.boundaries[atOrAfter(this.boundaries, item.end)]!);
    }
    if (this.finishAt !== null && now >= this.finishAt) end = this.target.length;
    // Never expose half of a surrogate pair while the source can still grow.
    if (end && /[\uD800-\uDBFF]/.test(this.target[end - 1]!) && this.finishAt === null) end--;
    end = Math.max(before, end);
    this.visible = this.target.slice(0, end);
    this.arrivals = this.arrivals.filter(item => item.end > end);
    if (!this.pending) { this.credit = 0; this.lastAt = null; }
    return end !== before;
  }
}
