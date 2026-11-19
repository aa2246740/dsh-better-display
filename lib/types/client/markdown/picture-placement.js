import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import css from './MarkdownText.module.css';
/** The sheet's classes for the three picture placements. */
export const SHOT_CLASSES = {
    line: css.mentionLine,
    shot: css.mentionShot,
    inline: css.inlineShot
};
/**
 * Decide the placement for the current render context.
 * @param context - the flags the renderer tracks for inline-only content.
 * @returns the placement to use.
 */
export function shotPlacementOf(context) {
    // A heading renders the picture itself as its own sibling; adding one here too would
    // duplicate it and break the heading's single line.
    if (context.inHeading === true)
        return 'none';
    if (context.inInlineOnly === true)
        return 'inline';
    return 'block';
}
/**
 * The wrapper class for the picture, given a placement.
 * @param placement - where the picture belongs.
 * @param classes - the sheet's class names.
 * @returns the class to apply, or undefined when the parent emits the picture.
 */
export function shotClassFor(placement, classes) {
    if (placement === 'block')
        return classes.shot;
    if (placement === 'inline')
        return classes.inline;
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
export function ChipWithPicture({ chip, picture, context, classes }) {
    const placement = shotPlacementOf(context);
    if (picture === undefined || placement === 'none')
        return chip;
    const shot = _jsx("span", { className: shotClassFor(placement, classes), children: picture });
    if (placement === 'inline')
        return (_jsxs(_Fragment, { children: [chip, shot] }));
    return (_jsxs(_Fragment, { children: [_jsx("span", { className: classes.line, children: chip }), shot] }));
}
//# sourceMappingURL=picture-placement.js.map