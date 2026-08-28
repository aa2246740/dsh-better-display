/** Motion parameters from the public transitions.dev streaming-text recipe. */
export const WORD_MOTION = {
  duration: 350,
  gap: 60,
  blur: 1,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
  maxDelay: 240,
} as const;

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
const closingPunctuation = /^[\p{Pe}\p{Pf},.!?:;，。！？、；：％‰…·]+$/u;
const openingPunctuation = /^[\p{Ps}\p{Pi}]+$/u;
export interface RevealingWord { key: number; text: string; born: number | null }
interface SourceBirth { end: number; born: number | null }

/** Source-offset identity survives reparsing, frozen blocks, and final formatting. */
export class WordTimeline {
  generation = 0;
  hasLiveText = false;
  private source: string | null = null;
  private enabled = false;
  private revision = 0;
  private floor = 0;
  private lastBirth = -Infinity;
  private readonly births: SourceBirth[] = [];

  begin(source: string, enabled: boolean, revision: number, now: number): void {
    if (this.source === source && this.enabled === enabled && this.revision === revision) return;
    const replaced = revision !== this.revision || (this.source !== null && !source.startsWith(this.source));
    if (replaced || !enabled) {
      this.births.length = 0;
      this.lastBirth = -Infinity;
      this.generation++;
      this.floor = source.length;
    } else if (this.source === null) {
      // A mounted historical prefix must not replay; a fresh live buffer mounts empty.
      this.floor = source.length;
    } else {
      // Allocate in source order, before Markdown can split/reorder text leaves.
      // Intervals cover every offset, so resegmented CJK words inherit the time
      // of their characters rather than falling through as instant "history".
      const from = this.source.length;
      for (const part of segmenter.segment(source.slice(from))) {
        let born = Number.isFinite(this.lastBirth) ? this.lastBirth : null;
        if (part.segment.trim()) {
          born = Math.min(now + WORD_MOTION.maxDelay, Math.max(now, this.lastBirth + WORD_MOTION.gap));
          this.lastBirth = born;
        }
        const end = from + part.index + part.segment.length;
        const previous = this.births.at(-1);
        if (previous && previous.born === born) previous.end = end;
        else this.births.push({ end, born });
      }
    }
    this.source = source;
    this.enabled = enabled;
    this.revision = revision;
    this.hasLiveText ||= enabled;
  }

  bornAt(offset: number): number | null {
    if (!this.enabled || offset < this.floor || this.births.length === 0) return null;
    let low = 0;
    let high = this.births.length - 1;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (this.births[middle]!.end <= offset) low = middle + 1;
      else high = middle;
    }
    return this.births[low]!.born;
  }

  words(value: string, offset: number): RevealingWord[] {
    // Atomic inline animation boxes must not turn commas into legal line starts
    // or strand opening quotes at a line end. Keep source-offset identities when
    // punctuation arrives in a later chunk, so the preceding word never replays.
    const parts: { index: number; segment: string }[] = [];
    for (const part of segmenter.segment(value)) {
      const previous = parts.at(-1);
      if (previous?.segment.trim() && (closingPunctuation.test(part.segment) || openingPunctuation.test(previous.segment))) {
        previous.segment += part.segment;
      } else parts.push({ index: part.index, segment: part.segment });
    }
    return parts.map(part => {
      const key = offset + part.index;
      return { key, text: part.segment, born: this.bornAt(key) };
    });
  }
}
