/**
 * Where a picture reference's picture goes.
 *
 * The same decision is made for a link and for an inline-code mention, and it depends on
 * the context the reference appears in:
 *
 *  - prose — the name on one line, the picture on the next;
 *  - a heading — the heading emits the picture below itself, so nothing is added here;
 *  - `strong` / `em` / `del` / an anchor — inline only, because a block box there is
 *    invalid nesting and the browser hoists it out of the paragraph.
 *
 * Getting this wrong is what split headings in two, and would have done the same to bold
 * text. Keeping the rule in one place stops the two call sites drifting apart.
 *
 * @module
 */
import type { ReactNode } from 'react';
/** The sheet's classes for the three picture placements. */
export declare const SHOT_CLASSES: ShotClasses;
/** How a picture should be placed relative to its reference. */
export type ShotPlacement = 'block' | 'inline' | 'none';
/** The class names the sheet gives each placement. */
export interface ShotClasses {
    /** The reference's own line in prose. */
    readonly line: string;
    /** The picture's own line in prose. */
    readonly shot: string;
    /** The inline wrapper used where a block box is invalid. */
    readonly inline: string;
}
/**
 * Decide the placement for the current render context.
 * @param context - the flags the renderer tracks for inline-only content.
 * @returns the placement to use.
 */
export declare function shotPlacementOf(context: {
    readonly inHeading?: boolean;
    readonly inInlineOnly?: boolean;
}): ShotPlacement;
/**
 * The wrapper class for the picture, given a placement.
 * @param placement - where the picture belongs.
 * @param classes - the sheet's class names.
 * @returns the class to apply, or undefined when the parent emits the picture.
 */
export declare function shotClassFor(placement: ShotPlacement, classes: ShotClasses): string | undefined;
/**
 * A chip with its picture, placed for the current context.
 *
 * Shared by the link and inline-code paths so the two cannot disagree about where a
 * picture goes.
 * @param props - the chip, the picture, the context and the sheet's classes.
 * @returns the nodes to render.
 */
export declare function ChipWithPicture({ chip, picture, context, classes }: {
    chip: ReactNode;
    picture: ReactNode | undefined;
    context: {
        readonly inHeading?: boolean;
        readonly inInlineOnly?: boolean;
    };
    classes: ShotClasses;
}): ReactNode;
//# sourceMappingURL=picture-placement.d.ts.map