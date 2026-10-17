import type { Context } from '@deepseek-ai/cordis';
import type { SlotEntryDef, SlotMap, SlotSpec, StoredEntry } from '@deepseek-ai/dsh-client-ui-slots';
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
export declare const OFFICIAL_SLOTS: {
    readonly actions: "conversation.chat.assistant-actions";
    readonly tools: "tool.call.toolview";
    readonly tail: "conversation.chat.turnTail";
    readonly nodes: "conversation.chat.node";
    readonly messageImages: "conversation.chat.message.images";
    readonly userImages: "conversation.chat.user.images";
};
export type OfficialFamily = keyof typeof OFFICIAL_SLOTS;
export declare const OFFICIAL_SEATS: {
    readonly actions: "dsh-better-display.official.actions/conversation.chat.assistant-actions";
    readonly tools: "dsh-better-display.official.tools/tool.call.toolview";
    readonly tail: "dsh-better-display.official.tail/conversation.chat.turnTail";
    readonly nodes: "dsh-better-display.official.nodes/conversation.chat.node";
    readonly messageImages: "dsh-better-display.official.messageImages/conversation.chat.message.images";
    readonly userImages: "dsh-better-display.official.userImages/conversation.chat.user.images";
};
export type OfficialSeat = typeof OFFICIAL_SEATS[OfficialFamily];
export declare const officialSeat: (family: OfficialFamily, source?: string) => string;
type Spec = SlotSpec<SlotEntryDef>;
type Registration = StoredEntry['options'] & Omit<StoredEntry, 'options' | 'component'> & {
    name: string;
};
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
        'dsh-better-display.official.messageImages/conversation.chat.message.images': SlotMap['conversation.chat.message.images'];
        'dsh-better-display.official.userImages/conversation.chat.user.images': SlotMap['conversation.chat.user.images'];
    }
}
/**
 * Reader already presents produced paths with its copy/reveal actions. RC2's
 * official tail additionally owns explicit `present` artifacts. Leave those
 * cards, actions and state intact, and omit only the duplicate produced chips.
 * This changes a presentation prop, never the source match or session data.
 * Unrecognized shapes pass through intact for safe forward degradation.
 */
export declare function readerTailMatch(value: unknown, displayedPaths?: readonly string[]): unknown;
export declare function officialChildren(slots: Pick<CompositionRegistry, 'spec'>): {
    [K in OfficialSeat]: SlotSpec<SlotMap[K]>;
};
/**
 * Mirror one elected contribution set incrementally. Unrelated additions do not
 * remount existing cards or recreate their subscriptions. A source unload/HMR
 * disposes the corresponding subtree and closures before its replacement.
 */
export declare function mirrorOfficialSlot(slots: CompositionRegistry, source: string, target: string, namespace: string, accept?: (entry: StoredEntry) => boolean): () => void;
export declare function installOfficialSlots(ctx: Context): () => void;
export type OfficialSlotKey = typeof OFFICIAL_SLOTS[OfficialFamily] & keyof SlotMap;
export {};
//# sourceMappingURL=official-slots.d.ts.map