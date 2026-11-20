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
import { Fragment } from 'react';
import type { Key, ReactNode } from 'react';
import css from './MarkdownText.module.css';

/** The sheet's classes for the three picture placements. */
export const SHOT_CLASSES: ShotClasses = {
  line: css.mentionLine,
  shot: css.mentionShot,
  inline: css.inlineShot
};

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
export function shotPlacementOf(context: {
  readonly inHeading?: boolean;
  readonly inInlineOnly?: boolean;
}): ShotPlacement {
  // A heading renders the picture itself as its own sibling; adding one here too would
  // duplicate it and break the heading's single line.
  if (context.inHeading === true) return 'none';
  if (context.inInlineOnly === true) return 'inline';
  return 'block';
}

/**
 * The wrapper class for the picture, given a placement.
 * @param placement - where the picture belongs.
 * @param classes - the sheet's class names.
 * @returns the class to apply, or undefined when the parent emits the picture.
 */
export function shotClassFor(placement: ShotPlacement, classes: ShotClasses): string | undefined {
  if (placement === 'block') return classes.shot;
  if (placement === 'inline') return classes.inline;
  return undefined;
}

/**
 * A chip with its picture, placed for the current context.
 *
 * Shared by the link and inline-code paths so the two cannot disagree about where a
 * picture goes.
 * @param props - the chip, the picture, the context and the sheet's classes.
 * @returns the nodes to render.
 */
export function ChipWithPicture({
  chip,
  picture,
  context,
  classes,
  nodeKey
}: {
  chip: ReactNode;
  picture: ReactNode | undefined;
  context: { readonly inHeading?: boolean; readonly inInlineOnly?: boolean };
  classes: ShotClasses;
  /** Applied to the fragments, so a list of references keeps stable keys. */
  nodeKey?: Key;
}): ReactNode {
  const placement = shotPlacementOf(context);
  if (picture === undefined || placement === 'none') return chip;
  const shot = <span className={shotClassFor(placement, classes)}>{picture}</span>;
  if (placement === 'inline')
    return (
      <Fragment key={nodeKey}>
        {chip}
        {shot}
      </Fragment>
    );
  return (
    <Fragment key={nodeKey}>
      <span className={classes.line}>{chip}</span>
      {shot}
    </Fragment>
  );
}
