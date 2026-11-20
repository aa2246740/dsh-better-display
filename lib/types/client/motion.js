import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import css from './Reader.module.css';
import { StreamMotionContext } from './streaming.js';
import { reconcileTurnSlots } from './turn-slots.js';
const EASING = 'cubic-bezier(.22,1,.36,1)';
export function useMotionAllowed(enabled) {
    const [reduced, setReduced] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    useEffect(() => {
        const query = window.matchMedia('(prefers-reduced-motion: reduce)');
        const change = () => setReduced(query.matches);
        query.addEventListener('change', change);
        return () => query.removeEventListener('change', change);
    }, []);
    return enabled && !reduced;
}
export function usePinnedSelection(root, selector = '[data-reader-answer], [data-reader-body], [data-reader-process]') {
    const [keys, setKeys] = useState([]);
    useEffect(() => {
        const update = () => {
            const selection = document.getSelection();
            const range = selection && !selection.isCollapsed && selection.rangeCount ? selection.getRangeAt(0) : null;
            const next = range && root.current
                ? [...new Set(Array.from(root.current.querySelectorAll(selector))
                        .filter(element => range.intersectsNode(element))
                        .map(element => element.dataset.readerKey ?? element.dataset.readerProcessKey).filter(Boolean))]
                : [];
            setKeys(previous => previous.length === next.length && previous.every((key, index) => key === next[index]) ? previous : next);
        };
        document.addEventListener('selectionchange', update);
        return () => document.removeEventListener('selectionchange', update);
    }, [root, selector]);
    return keys;
}
export function StatusText({ text, motion, shimmer = false }) {
    const ref = useRef(null);
    const [visible, setVisible] = useState(() => !document.hidden);
    const [forcedColors, setForcedColors] = useState(() => window.matchMedia('(forced-colors: active)').matches);
    const allowed = motion && visible && !forcedColors;
    const [frame, setFrame] = useState({ text, id: 0, phase: 'idle', outgoing: null });
    // Adjust before commit, so a new label cannot paint once before its entry state.
    // Reuse the previous incoming key: a rapid change exits from its current pose.
    if (frame.text !== text)
        setFrame({
            text, id: frame.id + 1, phase: allowed ? 'start' : 'idle',
            outgoing: allowed ? { text: frame.text, id: frame.id } : null,
        });
    useEffect(() => {
        const update = () => setVisible(!document.hidden);
        const query = window.matchMedia('(forced-colors: active)');
        const colors = () => setForcedColors(query.matches);
        document.addEventListener('visibilitychange', update);
        query.addEventListener('change', colors);
        return () => { document.removeEventListener('visibilitychange', update); query.removeEventListener('change', colors); };
    }, []);
    useLayoutEffect(() => {
        const id = frame.id;
        const settle = () => setFrame(current => current.id === id && current.outgoing
            ? { ...current, phase: 'idle', outgoing: null } : current);
        if (!allowed) {
            settle();
            return;
        }
        if (!frame.outgoing || !ref.current)
            return;
        // Commit the supplied .is-enter-start pose before releasing CSS transitions.
        ref.current.getBoundingClientRect();
        let timer = 0;
        const tick = requestAnimationFrame(() => {
            setFrame(current => current.id === id ? { ...current, phase: 'running' } : current);
            timer = window.setTimeout(settle, 200); // 150ms swap + 50ms incoming gap.
        });
        return () => { cancelAnimationFrame(tick); window.clearTimeout(timer); };
    }, [frame.id, allowed]);
    const active = shimmer && allowed;
    const swapping = allowed && frame.outgoing !== null;
    return _jsxs("span", { className: css.statusText, "data-reader-status": true, "data-reader-busy": shimmer, "data-ud-check": "reader-status", children: [_jsxs("span", { className: css.think, "aria-hidden": "true", "data-active": active, "data-reader-status-phase": swapping ? frame.phase : 'idle', "data-ud-motion": "reader-thinking-state", children: [_jsx("span", { className: css.thinkSizer, children: text }), swapping && _jsx("span", { className: `${css.thinkText} ${frame.phase === 'running' ? css.isExit : ''}`, "data-reader-status-copy": "outgoing", "data-text": frame.outgoing.text, children: frame.outgoing.text }, frame.outgoing.id), _jsx("span", { ref: ref, className: `${css.thinkText} ${swapping && frame.phase === 'start' ? css.isEnterStart : ''}`, "data-reader-status-copy": "current", "data-reader-shimmer": active || undefined, "data-text": text, children: text }, frame.id)] }), _jsx("span", { className: css.srOnly, role: "status", "aria-live": "polite", "aria-atomic": "true", children: text })] });
}
export function Disclosure({ open, onChange, label, controls, buttonRef, ariaLabel }) {
    const name = ariaLabel ?? '思考与过程';
    return _jsx("div", { className: css.disclosure, "data-reader-disclosure": true, "data-expanded": open, children: _jsxs("button", { ref: buttonRef, type: "button", className: css.disclosureButton, "aria-label": `${open ? '收起' : '展开'}${name}`, "aria-expanded": open, ...(controls ? { 'aria-controls': controls } : {}), onClick: () => onChange(!open), children: [label, _jsx("svg", { className: css.chevron, "data-open": open, viewBox: "0 0 16 16", width: "12", height: "12", "aria-hidden": "true", children: _jsx("path", { d: "m6 4 4 4-4 4" }) })] }) });
}
/** Supplemental details stay in source order beside their own narration. */
export function ProcessFragment({ open, motion, onRead, returnFocusTo, nodeKey, children, framed = false }) {
    const body = useRef(null);
    const running = useRef(null);
    const previous = useRef(open);
    const [present, setPresent] = useState(open);
    useLayoutEffect(() => {
        const element = body.current;
        if (!element)
            return;
        const from = running.current ? element.getBoundingClientRect().height : previous.current ? element.scrollHeight : 0;
        running.current?.cancel();
        running.current = null;
        const changed = previous.current !== open;
        previous.current = open;
        if (open)
            setPresent(true);
        if (!open && element.contains(document.activeElement))
            returnFocusTo.current?.focus();
        element.style.height = open ? 'auto' : '0px';
        const target = open ? element.scrollHeight : 0;
        if (!motion || !changed || Math.abs(from - target) < 1) {
            setPresent(open);
            return;
        }
        const animation = element.animate(from > target
            ? [
                { offset: 0, height: `${from}px`, opacity: 1, transform: 'scaleY(1) translateY(0)' },
                { offset: 0.32, height: `${Math.round(from * 0.92)}px`, opacity: 0.35, transform: 'scaleY(0.96) translateY(-2px)' },
                { offset: 1, height: `${target}px`, opacity: 0, transform: 'scaleY(0.68) translateY(-8px)' },
            ]
            : [
                { offset: 0, height: `${from}px`, opacity: 0, transform: 'scaleY(0.8) translateY(6px)' },
                { offset: 0.3, height: `${Math.round(target * 0.4)}px`, opacity: 0.4, transform: 'scaleY(0.92) translateY(3px)' },
                { offset: 1, height: `${target}px`, opacity: 1, transform: 'scaleY(1) translateY(0)' },
            ], { duration: 380, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' });
        running.current = animation;
        let settled = false;
        const settle = () => {
            if (settled)
                return;
            settled = true;
            if (running.current === animation)
                running.current = null;
            animation.cancel();
            setPresent(open);
        };
        animation.onfinish = settle;
        // `fill: 'both'\` pins the opening keyframe (height 0, opacity 0), so while this
        // animation runs the body is *invisible* no matter what the element's style says.
        // An animation that never finishes — cancelled by a re-run, an unmount, or a
        // compositor that drops it — would then leave the row looking like it refused to
        // open, which is exactly the reported symptom. Cancel is only safe once the
        // state change has been committed, so the deadline does both.
        const deadline = window.setTimeout(settle, 380 + 240);
        return () => {
            window.clearTimeout(deadline);
            running.current?.cancel();
        };
    }, [open, motion, returnFocusTo]);
    if (!open && !present)
        return null;
    return _jsx("div", { ref: body, className: css.disclosureBody, "data-reader-process": true, "data-reader-process-key": nodeKey, "data-ud-motion": "reader-process-size", "aria-hidden": !open, onPointerDown: () => { if (open)
            onRead(); }, onFocusCapture: () => { if (open)
            onRead(); }, ...(!open ? { inert: '' } : {}), children: _jsx("div", { className: framed ? css.processFrame : css.processContents, children: children }) });
}
/** Retire only narration that was actually visible; historical rows stay folded. */
/** True inside a turn that left the visible order and is collapsing out. */
export const RetiringTurnContext = createContext(false);
export function RetiringContent({ visible, children, onRetired }) {
    const { enabled } = useContext(StreamMotionContext);
    const root = useRef(null);
    const animation = useRef(null);
    const [present, setPresent] = useState(visible);
    const [focusHeld, setFocusHeld] = useState(false);
    // Held in a ref so a caller passing an inline closure does not restart the
    // collapse every render, and so the settle path always sees the latest one.
    const retired = useRef(onRetired);
    retired.current = onRetired;
    useLayoutEffect(() => {
        const element = root.current;
        if (visible) {
            animation.current?.cancel();
            animation.current = null;
            setPresent(true);
            return;
        }
        if (!element)
            return;
        // Reduced motion and a hidden page settle immediately. Focus may defer a
        // collapse that will actually play; it must not pin a reduced-motion rewind.
        // Move it to a surviving turn or the reading column first, or the browser
        // drops it on the document when this subtree unmounts.
        let retiredNow = false;
        const retireNow = () => {
            if (retiredNow)
                return;
            retiredNow = true;
            animation.current?.cancel();
            animation.current = null;
            focusSurvivesRetire(element);
            setPresent(false);
            retired.current?.();
        };
        if (!enabled || document.hidden) {
            retireNow();
            return;
        }
        // The retiring-content harness stubs document without addEventListener.
        const canListen = typeof document.addEventListener === 'function';
        const holdsFocus = element.contains(document.activeElement);
        if (holdsFocus || focusHeld) {
            if (holdsFocus)
                setFocusHeld(true);
            // Focus defers only a collapse that will play. `document.hidden` is not
            // state, so a page hidden while focus waits must retire from here.
            const onHiddenWhileHeld = () => { if (document.hidden)
                retireNow(); };
            if (canListen)
                document.addEventListener('visibilitychange', onHiddenWhileHeld);
            return () => { if (canListen)
                document.removeEventListener('visibilitychange', onHiddenWhileHeld); };
        }
        const from = element.getBoundingClientRect().height;
        animation.current?.cancel();
        animation.current = null;
        if (from < 1) {
            setPresent(false);
            retired.current?.();
            return;
        }
        const next = element.animate([{ height: `${from}px`, opacity: 1 }, { height: '0px', opacity: 0 }], { duration: 220, easing: EASING, fill: 'both' });
        animation.current = next;
        let settled = false;
        const settle = () => {
            if (settled || animation.current !== next)
                return;
            settled = true;
            animation.current = null;
            next.cancel();
            setPresent(false);
            retired.current?.();
        };
        next.onfinish = settle;
        // #60: a stalled WAAPI finish must not leave the row mounted.
        const deadline = window.setTimeout(settle, 220 + 240);
        const onHide = () => { if (document.hidden)
            settle(); };
        if (canListen)
            document.addEventListener('visibilitychange', onHide);
        return () => {
            window.clearTimeout(deadline);
            if (canListen)
                document.removeEventListener('visibilitychange', onHide);
            if (animation.current === next)
                animation.current = null;
            next.cancel();
        };
    }, [visible, enabled, focusHeld]);
    useEffect(() => () => animation.current?.cancel(), []);
    if (!visible && !present)
        return null;
    return _jsx("div", { ref: root, className: css.retiringContent, "data-reader-retiring": visible ? 'visible' : 'retiring', "data-ud-motion": "reader-progress-retire", onBlur: event => { if (!event.currentTarget.contains(event.relatedTarget))
            setFocusHeld(false); }, children: _jsx(RetiringTurnContext.Provider, { value: !visible, children: children }) });
}
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
 * Live slots follow the incoming group order, so older history stays above the
 * tail. A collapsing turn stays next to the live neighbour that preceded it;
 * appending it would jump it to the bottom for the length of the animation.
 * Retention is bounded by the animation itself: `onRetired`
 * drops the slot, so a departing turn lives for one collapse and no longer —
 * and a key that comes back later is re-added as a live slot.
 */
export function RetiringTurns({ groups, render }) {
    const [slots, setSlots] = useState(() => groups.map((group) => ({ group, live: true })));
    // Reconcile after every commit rather than during render: a key that left the
    // order becomes `live: false` and keeps its index, which is what lets the
    // collapse play in place instead of jumping the turn to the bottom.
    useLayoutEffect(() => {
        setSlots(current => reconcileTurnSlots(current, groups));
    }, [groups]);
    return (_jsx(_Fragment, { children: slots.map((slot) => (_jsx(RetiringContent, { visible: slot.live, onRetired: () => setSlots((current) => current.filter((candidate) => candidate.live || candidate.group.key !== slot.group.key)), children: render(slot.group) }, slot.group.key))) }));
}
/** A turn that is still on screen, not one this commit is about to unmount. */
function survivingTurn(node) {
    if (!(node instanceof HTMLElement) || node.dataset.readerRetiring === 'retiring')
        return null;
    const turn = node.hasAttribute('data-reader-turn') ? node : node.querySelector('[data-reader-turn]');
    if (turn === null)
        return null;
    const retiring = turn.closest('[data-reader-retiring]');
    if (retiring instanceof HTMLElement && retiring.dataset.readerRetiring === 'retiring')
        return null;
    return turn;
}
/**
 * Where focus goes when cut content is removed without an animation.
 * Prefer the nearest turn that is still live. Otherwise the reading column
 * (or the host scrollport) so focus does not fall through to the document.
 */
function retireFocusTarget(element) {
    const parent = element.parentElement;
    if (parent) {
        const siblings = [...parent.children];
        const index = siblings.indexOf(element);
        for (let cursor = index - 1; cursor >= 0; cursor--) {
            const turn = survivingTurn(siblings[cursor]);
            if (turn)
                return turn;
        }
        for (let cursor = index + 1; cursor < siblings.length; cursor++) {
            const turn = survivingTurn(siblings[cursor]);
            if (turn)
                return turn;
        }
    }
    const column = element.closest('[data-chat-flow]');
    if (column && !element.contains(column))
        return column;
    const scroll = element.closest('[data-conversation-scroll]');
    if (scroll && !element.contains(scroll))
        return scroll;
    return null;
}
/** Move focus out of `element` before it unmounts. A no-op when focus is elsewhere. */
function focusSurvivesRetire(element) {
    const active = document.activeElement;
    if (active === null || !element.contains(active))
        return;
    const target = retireFocusTarget(element);
    if (target === null || element.contains(target))
        return;
    if (target.tabIndex < 0)
        target.tabIndex = -1;
    target.focus({ preventScroll: true });
}
// DOM-only behavior: the native Session remains the sole source of business data.
export function useReadingScroll(root, motion) {
    const port = useRef(null);
    const following = useRef(true);
    // Tracked separately from `following`: only an explicit reader action clears
    // this, so a fold-induced scroll clamp cannot permanently drop the tail.
    const pinned = useRef(true);
    const anchor = useRef(null);
    const cancelFollow = useRef(() => { });
    const [detached, setDetached] = useState(false);
    useLayoutEffect(() => {
        const content = root.current;
        if (!content)
            return;
        const scroll = content.closest('[data-conversation-scroll]') ?? content;
        port.current = scroll;
        // Browser scroll anchoring moves the viewport on its own as the transcript
        // grows, which reads as the page freezing mid-follow.
        const previousOverflowAnchor = scroll.style.overflowAnchor;
        scroll.style.overflowAnchor = 'none';
        let followFrame = 0;
        let lastFrameAt = 0;
        let layoutDepth = 0;
        let lastWrittenTop = null;
        const layoutStart = () => {
            layoutDepth++;
            cancelAnimationFrame(followFrame);
            followFrame = 0;
            capture();
        };
        const layoutEnd = () => {
            layoutDepth = Math.max(0, layoutDepth - 1);
            if (!layoutDepth && following.current && !followFrame) {
                lastFrameAt = performance.now();
                followFrame = requestAnimationFrame(follow);
            }
        };
        cancelFollow.current = () => {
            cancelAnimationFrame(followFrame);
            followFrame = 0;
            lastWrittenTop = null;
        };
        const selected = () => {
            const selection = document.getSelection();
            return selection && !selection.isCollapsed && selection.anchorNode && content.contains(selection.anchorNode);
        };
        // Only a focused text field suspends tail-follow. Clicking a fold control
        // inside the reader also moves document.activeElement into `content`, and
        // treating that as "user is busy" froze following for the rest of the turn.
        const editingText = () => {
            const active = document.activeElement;
            if (!(active instanceof HTMLElement))
                return false;
            // The composer lives outside this subtree: focusing it must never stop
            // the transcript from following.
            if (!content.contains(active))
                return false;
            return active.isContentEditable || active.tagName === 'TEXTAREA' || active.tagName === 'INPUT';
        };
        const capture = () => {
            const top = scroll.getBoundingClientRect().top;
            const candidates = content.querySelectorAll('[data-reader-anchor]');
            let candidate = null;
            for (let index = 0; index < candidates.length; index++) {
                const element = candidates[index];
                if (element.getBoundingClientRect().bottom > top + 8) {
                    candidate = element;
                    break;
                }
            }
            // Record the anchor in DOCUMENT space, never viewport space. The viewport
            // offset also changes whenever the reader scrolls, so comparing it back
            // turned a plain scroll into an "anchor correction" that yanked the
            // viewport back to wherever the anchor had last been captured.
            anchor.current = candidate
                ? { element: candidate, docTop: candidate.getBoundingClientRect().top + scroll.scrollTop }
                : null;
        };
        // Anchor capture is only consumed while detached; coalesce DOM scans to one per frame.
        let captureFrame = 0;
        const scheduleCapture = () => {
            if (captureFrame)
                return;
            captureFrame = requestAnimationFrame(() => { captureFrame = 0; capture(); });
        };
        const atBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 25;
        // Intent to stay pinned to the bottom, tracked independently of the scroll
        // position. A fold collapse shrinks the transcript and the browser clamps
        // scrollTop, producing a scroll event indistinguishable from the reader
        // scrolling up; without this the reader silently detached exactly when the
        // turn's last content arrived, and the page stopped following.
        pinned.current = true;
        const onScroll = () => {
            // While a follow animation is actively driving scroll, do not cancel following midway.
            if (followFrame !== 0 || layoutDepth > 0)
                return;
            // Our easing frames must not be mistaken for a user leaving the bottom.
            if (lastWrittenTop !== null && Math.abs(scroll.scrollTop - lastWrittenTop) < 1)
                return;
            // Bind the follow intent to the position observed HERE. Every scroll that
            // reaches this point is the viewport moving under someone else's hand: a
            // wheel, a drag, a key, or the browser clamping the offset after a shrink.
            //
            // The previous form inferred detaching from a strictly upward delta against
            // lastWrittenTop, which left two holes. That baseline is nulled by
            // cancelFollow/onWheel/onTouch/onKey, and the guard above already returned
            // for any scroll whose delta is under 1px — so a reader parked mid-transcript
            // by a scrollbar drag stayed following === true AND pinned === true. The next
            // content growth then took the re-attach branch and yanked the viewport to
            // the bottom, discarding what they were reading. Reading the position
            // directly needs no baseline: a fold's clamp lands at the very bottom and
            // still keeps following, while any other offset detaches.
            const bottom = atBottom();
            pinned.current = bottom;
            if (!bottom) {
                cancelAnimationFrame(followFrame);
                followFrame = 0;
                scheduleCapture();
            }
            if (!following.current) {
                // Only an explicit return to the bottom resumes following.
                if (bottom) {
                    following.current = true;
                    setDetached(false);
                }
                return;
            }
            if (!bottom) {
                following.current = false;
                setDetached(true);
            }
        };
        const onWheel = (event) => {
            cancelAnimationFrame(followFrame);
            followFrame = 0;
            lastWrittenTop = null;
            if (event.deltaY < 0) {
                following.current = false;
                setDetached(true);
                pinned.current = false;
                scheduleCapture();
            }
        };
        const onTouch = () => {
            cancelAnimationFrame(followFrame);
            followFrame = 0;
            lastWrittenTop = null;
        };
        const onKey = (event) => {
            if (event.target instanceof HTMLElement && event.target.closest('textarea,input,[contenteditable=true]'))
                return;
            if (['PageUp', 'Home', 'ArrowUp'].includes(event.key)) {
                cancelAnimationFrame(followFrame);
                followFrame = 0;
                lastWrittenTop = null;
                following.current = false;
                setDetached(true);
                pinned.current = false;
                scheduleCapture();
            }
        };
        const writeTop = (top) => { scroll.scrollTop = top; lastWrittenTop = scroll.scrollTop; };
        const follow = (now) => {
            followFrame = 0;
            if (!following.current || selected() || editingText())
                return;
            if (layoutDepth > 0)
                return;
            const gap = scroll.scrollHeight - scroll.clientHeight - scroll.scrollTop;
            const delta = Math.min(48, Math.max(1, now - lastFrameAt));
            lastFrameAt = now;
            if (!motion || Math.abs(gap) < 1.5) {
                writeTop(scroll.scrollHeight);
                capture();
                return;
            }
            writeTop(scroll.scrollTop + gap * (1 - Math.exp(-delta / 52)));
            followFrame = requestAnimationFrame(follow);
        };
        const firstFrame = requestAnimationFrame(() => {
            if (following.current && !selected())
                writeTop(scroll.scrollHeight);
            capture();
        });
        let lastHeight = content.scrollHeight;
        const observer = new ResizeObserver(() => {
            if (selected())
                return;
            const height = scroll.scrollHeight;
            const grew = height > lastHeight + 1;
            lastHeight = height;
            // Growth while the reader intends to be at the bottom re-attaches the
            // tail. This is the self-healing path for the clamp case above and is
            // also what keeps the viewport moving when a turn ends.
            if (grew && pinned.current && !editingText()) {
                following.current = true;
                setDetached(false);
            }
            if (following.current && !editingText()) {
                // Height is already animated: no second, lagging scroll easing.
                if (!motion || layoutDepth > 0)
                    writeTop(scroll.scrollHeight);
                else if (!followFrame) {
                    lastFrameAt = performance.now();
                    followFrame = requestAnimationFrame(follow);
                }
            }
            else if (!following.current && anchor.current?.element.isConnected) {
                // Only a real layout change above the anchor needs compensation. A reader
                // scroll moves the viewport offset but not the document offset, so this
                // stays silent while the reader is scrolling and cannot snap back.
                const delta = anchor.current.element.getBoundingClientRect().top + scroll.scrollTop - anchor.current.docTop;
                if (Math.abs(delta) > .5)
                    writeTop(scroll.scrollTop + delta);
            }
            capture();
        });
        observer.observe(content);
        if (scroll !== content)
            observer.observe(scroll);
        content.addEventListener('reader-layout-start', layoutStart);
        content.addEventListener('reader-layout-end', layoutEnd);
        scroll.addEventListener('scroll', onScroll, { passive: true });
        scroll.addEventListener('wheel', onWheel, { passive: true });
        scroll.addEventListener('touchstart', onTouch, { passive: true });
        scroll.addEventListener('touchmove', onTouch, { passive: true });
        scroll.addEventListener('keydown', onKey);
        return () => {
            cancelAnimationFrame(firstFrame);
            cancelAnimationFrame(followFrame);
            cancelAnimationFrame(captureFrame);
            observer.disconnect();
            content.removeEventListener('reader-layout-start', layoutStart);
            content.removeEventListener('reader-layout-end', layoutEnd);
            scroll.style.overflowAnchor = previousOverflowAnchor;
            scroll.removeEventListener('scroll', onScroll);
            scroll.removeEventListener('wheel', onWheel);
            scroll.removeEventListener('touchstart', onTouch);
            scroll.removeEventListener('touchmove', onTouch);
            scroll.removeEventListener('keydown', onKey);
        };
    }, [root, motion]);
    const jump = useCallback(() => {
        cancelFollow.current();
        anchor.current = null;
        following.current = true;
        pinned.current = true;
        setDetached(false);
        if (port.current) {
            port.current.scrollTop = port.current.scrollHeight;
        }
    }, []);
    const release = useCallback(() => {
        cancelFollow.current();
        following.current = false;
        pinned.current = false;
        anchor.current = null;
        setDetached(true);
    }, []);
    return { detached, jump, release };
}
//# sourceMappingURL=motion.js.map