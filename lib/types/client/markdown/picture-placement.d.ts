import type { Key, ReactNode } from 'react';
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
export declare function ChipWithPicture({ chip, picture, context, classes, nodeKey }: {
    chip: ReactNode;
    picture: ReactNode | undefined;
    context: {
        readonly inHeading?: boolean;
        readonly inInlineOnly?: boolean;
    };
    classes: ShotClasses;
    /** Applied to the fragments, so a list of references keeps stable keys. */
    nodeKey?: Key;
}): ReactNode;
//# sourceMappingURL=picture-placement.d.ts.map