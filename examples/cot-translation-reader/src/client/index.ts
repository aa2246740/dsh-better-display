/**
 * Reference adapter: show the official COT translation in the reading view.
 *
 * The official bundle registers translated reasoning on
 * `conversation.chat.reasoning.body`, a slot the reading view replaces. This
 * plugin registers on `dsh-better-display.text-transform` instead and lets the
 * reading view paint the result. Display-only: the session, the transcript and
 * the fold keep the original text.
 */
import type { Context } from '@deepseek-ai/cordis';

const SEAM = 'dsh-better-display.text-transform';
const COT = 'cotTranslation';

interface Request {
  text: string;
  streaming: boolean;
  blockKey: string;
  kind: 'reasoning' | 'body';
  source?: 'assistant' | 'user' | 'tool';
}

interface Display {
  text: string;
  final: boolean;
}

interface Seam {
  register(kind: 'reasoning', transformer: {
    read(request: Request): Display | undefined;
    subscribe(listener: () => void): () => void;
  }): () => void;
}

interface CotService {
  limits(signal: AbortSignal): Promise<{ maxTextChars: number; preferences: { provider: string; targetLanguage: string } }>;
  translate(request: { text: string; targetLanguage: string; provider?: string }, signal: AbortSignal): Promise<string>;
}

/** One request-sized slice and the whitespace that stays verbatim after it. */
interface Fragment {
  body: string;
  suffix: string;
}

/** Completed paragraphs only; a running tail is never submitted. */
export function fragments(text: string, running: boolean, limit: number): { list: Fragment[]; tail: string } {
  const list: Fragment[] = [];
  const parts = text.split(/(\n[ \t]*\n[ \t]*)/);
  let tail = '';
  for (let index = 0; index < parts.length; index += 2) {
    const body = parts[index];
    const suffix = parts[index + 1] ?? '';
    const last = index + 2 >= parts.length;
    if (last && running) {
      tail = body + suffix;
      break;
    }
    if (body.trim() === '') {
      if (list.length > 0) list[list.length - 1].suffix += body + suffix;
      continue;
    }
    let rest = body;
    while (rest.length > limit) {
      let cut = rest.lastIndexOf(' ', limit);
      if (cut < limit / 2) cut = limit;
      list.push({ body: rest.slice(0, cut), suffix: '' });
      rest = rest.slice(cut);
    }
    list.push({ body: rest, suffix });
  }
  return { list, tail };
}

export const name = 'cot-translation-example';
export const inject = [SEAM];

export function apply(ctx: Context): () => void {
  const get = (name: string) => (ctx as unknown as { get?: (key: string) => unknown }).get?.call(ctx, name);
  const seam = get(SEAM) as Seam | undefined;
  const cot = () => get(COT) as CotService | undefined;
  if (!seam) return () => {};

  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of [...listeners]) listener(); };
  interface Entry {
    source: string;
    list: Fragment[];
    tail: string;
    results: Map<string, string>;
    shown?: string;
    pending: boolean;
    dirty: boolean;
  }
  const states = new Map<string, Entry>();
  let target: { limit: number; provider: string; language: string } | undefined;
  let preparing = false;
  let disposed = false;

  const paint = (state: Entry): string | undefined => {
    if (state.results.size === 0) return undefined;
    let text = '';
    for (const fragment of state.list) text += (state.results.get(fragment.body) ?? fragment.body) + fragment.suffix;
    return text + state.tail;
  };

  const fill = async (key: string) => {
    const service = cot();
    const state = states.get(key);
    if (!service || !state || !target || state.pending || disposed) return;
    state.pending = true;
    try {
      for (const fragment of state.list) {
        if (state.results.has(fragment.body) || fragment.body.trim() === '') continue;
        const translated = await service.translate(
          { text: fragment.body, targetLanguage: target.language, provider: target.provider },
          new AbortController().signal,
        );
        if (disposed) return;
        state.results.set(fragment.body, translated);
        state.shown = paint(state);
        notify();
      }
    } catch (error) {
      // Keep the source on screen; the next paint can retry.
      console.warn('[cot-translation-example] translation failed; keeping the source text', error);
    } finally {
      state.pending = false;
    }
  };

  const prepare = async () => {
    const service = cot();
    if (!service || target || preparing || disposed) return;
    preparing = true;
    try {
      const snapshot = await service.limits(new AbortController().signal);
      target = {
        limit: snapshot.maxTextChars,
        provider: snapshot.preferences.provider,
        language: snapshot.preferences.targetLanguage,
      };
      notify();
    } finally {
      preparing = false;
    }
  };

  return seam.register('reasoning', {
    read(request) {
      if (disposed || request.source === 'tool' || request.kind !== 'reasoning') return undefined;
      if (!cot()) return undefined;
      let state = states.get(request.blockKey);
      if (!state) {
        state = { source: '', list: [], tail: '', results: new Map(), pending: false, dirty: false };
        states.set(request.blockKey, state);
      }
      if (state.source !== request.text) {
        state.source = request.text;
        state.dirty = true;
      }
      void prepare();
      if (!target) return state.shown === undefined ? undefined : { text: state.shown, final: !request.streaming };
      if (state.dirty) {
        state.dirty = false;
        const split = fragments(state.source, request.streaming, target.limit);
        state.list = split.list;
        state.tail = split.tail;
        state.shown = paint(state);
        void fill(request.blockKey);
      }
      return state.shown === undefined ? undefined : { text: state.shown, final: !request.streaming };
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  });
}
