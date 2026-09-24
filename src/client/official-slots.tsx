import { createElement, memo, useMemo, type ComponentType, type ReactNode } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { SlotEntryDef, SlotMap, SlotSpec, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';

/**
 * RC2 composition adapter. Only public registry operations are used. We lend
 * registrations a Reader-owned seat, not a second implementation of their UI.
 * The platform still binds injection, hooks, locale, stores and boundaries.
 * Original entries, declarations and components are never changed.
 *
 * Child seats have unique names because RC2 declarations have one owner. The
 * sole component wrapper translates those names before delegating to the
 * framework-provided renderSlot. It does not implement a slot renderer.
 */
export const OFFICIAL_SLOTS = {
  actions: 'conversation.chat.assistant-actions',
  tools: 'tool.call.toolview',
  tail: 'conversation.chat.turnTail',
  nodes: 'conversation.chat.node',
  images: 'conversation.message.images',
} as const;
export type OfficialFamily = keyof typeof OFFICIAL_SLOTS;
export const OFFICIAL_SEATS = {
  actions: 'dsh-better-display.official.actions/conversation.chat.assistant-actions',
  tools: 'dsh-better-display.official.tools/tool.call.toolview',
  tail: 'dsh-better-display.official.tail/conversation.chat.turnTail',
  nodes: 'dsh-better-display.official.nodes/conversation.chat.node',
  images: 'dsh-better-display.official.images/conversation.message.images',
} as const;
export type OfficialSeat = typeof OFFICIAL_SEATS[OfficialFamily];
export const officialSeat = (family: OfficialFamily, source: string = OFFICIAL_SLOTS[family]) =>
  `dsh-better-display.official.${family}/${source}`;

type Spec = SlotSpec<SlotEntryDef>;
type Render = (key: string, owner: object, options?: object) => ReactNode;
type RenderProps = { renderSlot: Render; renderSlotChain?: Render } & Record<string, unknown>;
type Registration = StoredEntry['options'] & Omit<StoredEntry, 'options' | 'component'> & { name: string };

/** The documented, type-erased registry inspection/registration boundary. */
export interface CompositionRegistry {
  spec(key: string): Spec | undefined;
  entriesOfSlot(key: string): readonly StoredEntry[];
  subscribe(key: string, listener: () => void): () => void;
  inject(key: string, effect: () => () => void): () => void;
  register(options: Registration, component: unknown): () => void;
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'dsh-better-display.official.actions/conversation.chat.assistant-actions': SlotMap['conversation.chat.assistant-actions'];
    'dsh-better-display.official.tools/tool.call.toolview': SlotMap['tool.call.toolview'];
    'dsh-better-display.official.tail/conversation.chat.turnTail': SlotMap['conversation.chat.turnTail'];
    'dsh-better-display.official.nodes/conversation.chat.node': SlotMap['conversation.chat.node'];
    'dsh-better-display.official.images/conversation.message.images': SlotMap['conversation.message.images'];
  }
}

// Existing Reader presentations own these rows. All other node kinds, including
// future registrations, reach the official renderer through the fallback seat.
const READER_NODES = new Set(['user', 'steering', 'assistant-step', 'tool-call', 'turn-tail', 'turn-process']);
const EXPECTED: Record<OfficialFamily, Spec> = {
  actions: { kind: 'list', scope: 'session' },
  tools: { kind: 'keyed', scope: 'session' },
  tail: { kind: 'list', scope: 'session' },
  nodes: { kind: 'keyed', scope: 'session' },
  images: { kind: 'single', scope: 'session' },
};

/**
 * Reader already presents produced paths with its copy/reveal actions. RC2's
 * official tail additionally owns explicit `present` artifacts. Leave those
 * cards, actions and state intact, and omit only the duplicate produced chips.
 * This changes a presentation prop, never the source match or session data.
 * Unrecognized shapes pass through intact for safe forward degradation.
 */
export function readerTailMatch(value: unknown, displayedPaths?: readonly string[]): unknown {
  if (!value || typeof value !== 'object') return value;
  const match = value as Record<string, unknown>;
  const displayed = new Set(displayedPaths ?? []);
  return displayed.size > 0 && Array.isArray(match.produced) && Array.isArray(match.presented)
    ? { ...match, produced: match.produced.filter(path => !displayed.has(path)) }
    : value;
}

function tailPresentation(component: unknown) {
  const Original = component as ComponentType<Record<string, unknown>>;
  return memo(function ReaderTailPresentation(props: Record<string, unknown>) {
    const matched = useMemo(() => readerTailMatch(props.matched, props.readerProducedPaths as readonly string[] | undefined), [props.matched, props.readerProducedPaths]);
    return createElement(Original, { ...props, matched });
  });
}

export function officialChildren(slots: Pick<CompositionRegistry, 'spec'>): { [K in OfficialSeat]: SlotSpec<SlotMap[K]> } {
  return Object.fromEntries(Object.entries(OFFICIAL_SLOTS).map(([name, source]) => {
    const family = name as OfficialFamily;
    const spec = slots.spec(source);
    if (spec && (spec.kind !== EXPECTED[family].kind || spec.scope !== EXPECTED[family].scope)) {
      throw new Error(`Official slot contract changed: ${source} (${spec.kind}/${spec.scope})`);
    }
    // In particular, retain conversation.chat.node's contextual turn-data hook.
    return [officialSeat(family), spec ?? EXPECTED[family]];
  })) as { [K in OfficialSeat]: SlotSpec<SlotMap[K]> };
}

function translatedComponent(entry: StoredEntry, names: ReadonlyMap<string, string>) {
  if (names.size === 0) return entry.component;
  const Original = entry.component as ComponentType<Record<string, unknown>>;
  return memo(function OfficialSlotChildren(props: RenderProps) {
    const renders = useMemo(() => {
      const translate = (render: Render | undefined): Render => (key, owner, options) => {
        const seat = names.get(key);
        if (!seat || !render) throw new Error(`Undeclared official child slot: ${key}`);
        return render(seat, owner, options);
      };
      return {
        renderSlot: translate(props.renderSlot),
        ...(props.renderSlotChain ? { renderSlotChain: translate(props.renderSlotChain) } : {}),
      };
    }, [props.renderSlot, props.renderSlotChain]);
    return createElement(Original, { ...props, ...renders });
  });
}

/**
 * Mirror one elected contribution set incrementally. Unrelated additions do not
 * remount existing cards or recreate their subscriptions. A source unload/HMR
 * disposes the corresponding subtree and closures before its replacement.
 */
export function mirrorOfficialSlot(
  slots: CompositionRegistry,
  source: string,
  target: string,
  namespace: string,
  accept: (entry: StoredEntry) => boolean = () => true,
): () => void {
  const mounted = new Map<StoredEntry, () => void>();
  let stopped = false;
  const reconcile = () => {
    if (stopped) return;
    const entries = slots.entriesOfSlot(source).filter(accept);
    const wanted = new Set(entries);
    for (const [entry, dispose] of mounted) {
      if (wanted.has(entry)) continue;
      dispose();
      mounted.delete(entry);
    }
    for (const entry of entries) {
      if (mounted.has(entry)) continue;
      const names = new Map(Object.keys(entry.children ?? {}).map(key => [key, `${namespace}/${key}`]));
      const children = Object.fromEntries([...names].map(([key, seat]) => [seat, entry.children![key]]));
      const disposers: (() => void)[] = [];
      const dispose = () => { for (const stop of disposers.splice(0).reverse()) stop(); };
      try {
        const { component: _component, options, children: _children, ...metadata } = entry;
        const presentation = source === OFFICIAL_SLOTS.tail && entry.locale === 'deliverables'
          ? { ...entry, component: tailPresentation(entry.component) }
          : entry;
        disposers.push(slots.register({
          ...options, ...metadata, name: target,
          ...(names.size ? { children } : {}),
          registrant: `dsh-better-display → ${entry.registrant ?? source}`,
        }, translatedComponent(presentation, names)));
        for (const [key, seat] of names) {
          disposers.push(mirrorOfficialSlot(slots, key, seat, namespace));
        }
        mounted.set(entry, dispose);
      } catch (error) {
        dispose();
        throw error;
      }
    }
  };
  const unsubscribe = slots.subscribe(source, reconcile);
  const dispose = () => {
    stopped = true;
    unsubscribe();
    for (const stop of [...mounted.values()].reverse()) stop();
    mounted.clear();
  };
  try { reconcile(); } catch (error) { dispose(); throw error; }
  return dispose;
}

export function installOfficialSlots(ctx: Context): () => void {
  // The SlotMap overloads are for statically declared keys. Aliases are a
  // runtime composition, using exactly the public erased metadata contract.
  const slots = ctx.slots as unknown as CompositionRegistry;
  const disposers: (() => void)[] = [];
  try {
    for (const [name, source] of Object.entries(OFFICIAL_SLOTS)) {
      const family = name as OfficialFamily;
      disposers.push(slots.inject(source, () => {
        const spec = slots.spec(source)!;
        const target = officialSeat(family);
        const declared = slots.spec(target);
        if (spec.kind !== declared?.kind || spec.scope !== declared.scope) {
          throw new Error(`Official slot contract changed: ${source}`);
        }
        return mirrorOfficialSlot(slots, source, target, `dsh-better-display.official.${family}`,
          family === 'nodes' ? entry => !READER_NODES.has(entry.options.key ?? '') : undefined);
      }));
    }
  } catch (error) {
    for (const stop of disposers.reverse()) stop();
    throw error;
  }
  return () => { for (const stop of disposers.splice(0).reverse()) stop(); };
}

export type OfficialSlotKey = typeof OFFICIAL_SLOTS[OfficialFamily] & keyof SlotMap;
