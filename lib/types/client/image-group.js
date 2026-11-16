import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
/** Bands, widest first. A turn's tool pictures are `TOOL`; an answer's are `ANSWER`. */
export const TOOL_BAND = 0;
/** Pictures inside one final answer. */
export const ANSWER_BAND = 1;
const ViewerContext = createContext(null);
const RankContext = createContext(ANSWER_BAND);
/**
 * Declare the band for the pictures beneath this point.
 * @param props - the band and the children.
 */
export function ImageBand({ rank, children }) {
    return _jsx(RankContext.Provider, { value: rank, children: children });
}
/** The band a picture sits in, from the nearest {@link ImageBand}. */
export function useImageBand() {
    return useContext(RankContext);
}
/**
 * Provide one shared viewer for every picture beneath it.
 *
 * A picture opened at band `N` pages through every member whose rank is `<= N`, so
 * the viewer expands exactly as far as the entry point deserves: opening from a tool
 * call shows the turn's tool pictures *and* the answer's, while opening from the
 * answer shows only the answer's.
 * @param props - the pictures, and the renderer for the single viewer.
 */
export function ImageViewerScope({ children, render }) {
    // Registration order is render order, which is document order: numbering has to
    // match the order the reader sees the pictures in.
    const [order, setOrder] = useState([]);
    const members = useRef(new Map());
    const [version, setVersion] = useState(0);
    const [openId, setOpenId] = useState(null);
    /** The band the open picture came from; the ceiling for what it may page through. */
    const [ceiling, setCeiling] = useState(ANSWER_BAND);
    /**
     * Register during render rather than from an effect.
     *
     * An effect runs after paint and in the order React scheduled the components, which
     * is not the DOM order the reader sees: a folded tool block, a memoised part, or a
     * nested `Blocks` could register before its earlier sibling. That made a picture
     * report the wrong position in its own group. Registering while rendering ties the
     * order to the render order, which is document order.
     *
     * `join` is idempotent by id, so a component that renders repeatedly adds nothing
     * after the first time.
     */
    const join = useCallback((member) => {
        const existing = members.current.get(member.id);
        if (existing !== undefined) {
            if (existing.rank === member.rank && existing.src === member.src)
                return;
            members.current.set(member.id, { ...existing, rank: member.rank, src: member.src });
            setVersion(current => current + 1);
            return;
        }
        // No `seq` yet: document order is derived from the DOM, because a folded block
        // renders no thumbnails to count.
        members.current.set(member.id, member);
        setOrder(list => [...list, member.id]);
        setVersion(current => current + 1);
    }, []);
    const visible = useMemo(() => {
        void version;
        return (order
            .map(id => members.current.get(id))
            .filter((member) => member !== undefined)
            // A higher band is a NARROWER view, so opening at band N shows everything at or
            // below it: `rank >= ceiling`. Written the other way round it did the opposite 鈥?        // a tool-clicked picture showed only tool pictures and an answer-clicked one
            // showed the whole turn, which is exactly backwards.
            .filter(member => member.rank >= ceiling)
            // The wider band first, then document order inside a band, so a tool-opened
            // view reads tool pictures then answer pictures rather than interleaving them.
            // `seq` is the member's position in the document, assigned when it rendered, and
            // is what keeps the numbering stable 鈥?registration order alone was not.
            .sort((a, b) => a.rank - b.rank || (a.seq ?? 0) - (b.seq ?? 0)));
    }, [order, version, ceiling]);
    const index = openId === null ? -1 : visible.findIndex(member => member.id === openId);
    const current = index < 0 ? null : (visible[index] ?? null);
    /**
     * Renumber from the live DOM, which is the only authoritative document order.
     *
     * A tool picture lives inside a collapsible process block, and that block renders
     * nothing while it is folded 鈥?so those pictures are not registered at all until
     * the reader expands the block. Registering by callback therefore produced a group
     * whose order depended on what had been expanded, which is why a tool-opened picture
     * could claim the wrong position. Querying the thumbnails in document order cannot be
     * wrong: it is the order the reader sees.
     */
    const renumberFromDom = useCallback(() => {
        if (typeof document === 'undefined')
            return;
        const nodes = [...document.querySelectorAll('[data-reader-thumb]')];
        if (nodes.length === 0)
            return;
        let changed = false;
        nodes.forEach((node, position) => {
            const id = node.getAttribute('data-reader-thumb');
            if (id === null)
                return;
            const member = members.current.get(id);
            if (member === undefined || member.seq === position)
                return;
            members.current.set(id, { ...member, seq: position });
            changed = true;
        });
        if (changed)
            setVersion(current => current + 1);
    }, []);
    const viewer = useMemo(() => ({
        open: member => {
            join(member);
            // The entry point decides how wide the group is.
            setCeiling(member.rank);
            setOpenId(member.id);
            // Order the group from what is actually on screen, then let the next frame
            // settle the numbering.
            renumberFromDom();
        },
        join,
        current,
        index: index < 0 ? 1 : index + 1,
        total: visible.length === 0 ? 1 : visible.length,
        step: delta => {
            if (index < 0)
                return;
            const next = visible[index + delta];
            if (next === undefined)
                return;
            setOpenId(next.id);
        },
        close: () => setOpenId(null)
    }), [join, current, index, visible, renumberFromDom]);
    // A folded block reveals its pictures without the group being rebuilt, so re-derive
    // the order whenever the set of known pictures changes.
    useEffect(() => {
        renumberFromDom();
    }, [order.length, renumberFromDom]);
    return (_jsxs(ViewerContext.Provider, { value: viewer, children: [children, render(viewer)] }));
}
/**
 * The shared viewer, or null where no scope is present.
 *
 * Null means the picture manages its own dialog: nothing above it declared a group,
 * so there is nothing to page through.
 */
export function useSharedViewer() {
    return useContext(ViewerContext);
}
//# sourceMappingURL=image-group.js.map