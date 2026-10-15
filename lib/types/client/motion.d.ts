import type { ReactNode, RefObject } from 'react';
export declare function useMotionAllowed(enabled: boolean): boolean;
export declare function usePinnedSelection(root: RefObject<HTMLElement>, selector?: string): readonly string[];
export declare function StatusText({ text, motion, shimmer }: {
    text: string;
    motion: boolean;
    shimmer?: boolean;
}): import("react").JSX.Element;
export declare function Disclosure({ open, onChange, label, controls, buttonRef, ariaLabel }: {
    open: boolean;
    onChange: (value: boolean) => void;
    label: ReactNode;
    controls?: string;
    buttonRef: RefObject<HTMLButtonElement>;
    ariaLabel?: string;
}): import("react").JSX.Element;
/** Supplemental details stay in source order beside their own narration. */
export declare function ProcessFragment({ open, motion, onRead, returnFocusTo, nodeKey, children, framed }: {
    open: boolean;
    motion: boolean;
    onRead: () => void;
    nodeKey: string;
    returnFocusTo: RefObject<HTMLElement>;
    children: ReactNode;
    framed?: boolean;
}): import("react").JSX.Element | null;
/** Retire only narration that was actually visible; historical rows stay folded. */
export declare function RetiringContent({ visible, children, onRetired }: {
    visible: boolean;
    children: ReactNode;
    onRetired?: () => void;
}): import("react").JSX.Element | null;
/**
 * Keeps a departing turn mounted for the length of its own collapse.
 *
 * A rewind removes turns from the visible order, and unmounting them outright
 * snapped the transcript: every withdrawn row disappeared in one frame with
 * nothing to scroll. Instead each departing turn is retained, rendered with
 * `visible={false}` so it animates to zero height, and released only once the
 * collapse has settled — so the reader watches the rows fold away and the rows
 * below glide up into their place.
 *
 * Slots keep their previous index, so a collapsing turn stays exactly where the
 * reader last saw it; appending it would jump it to the bottom for the length
 * of the animation. Retention is bounded by the animation itself: `onRetired`
 * drops the slot, so a departing turn lives for one collapse and no longer —
 * and a key that comes back later is re-added as a live slot.
 */
export declare function RetiringTurns<T extends {
    readonly key: string;
}>({ groups, render }: {
    groups: readonly T[];
    render: (group: T) => ReactNode;
}): import("react").JSX.Element;
export declare function useReadingScroll(root: RefObject<HTMLElement>, motion: boolean): {
    detached: boolean;
    jump: () => void;
    /** Stop tail-follow so a rail landing is not pulled back to the live bottom. */
    release: () => void;
};
//# sourceMappingURL=motion.d.ts.map