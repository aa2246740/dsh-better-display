import { jsx as _jsx } from "react/jsx-runtime";
import { useEffect, useLayoutEffect, useState } from 'react';
import { ReaderEntryPolicy, readerEntryRequested } from './entry-policy.js';
import { TurnClock } from './TurnClock.js';
import { IDLE_CLOCK, createClockLane } from './turn-clock-lane.js';
import css from './Reader.module.css';
function isConversationStore(store) {
    return (typeof store === 'object' &&
        store !== null &&
        store.spec.persist === 'dsh.conversation' &&
        typeof store.spec.actions.setView === 'function');
}
function ReaderEntry({ useStore, actions, policy }) {
    const view = useStore(state => state.view);
    useLayoutEffect(() => {
        const next = policy.select(view);
        if (next)
            actions.setView(next);
    }, [view, actions, policy]);
    return null;
}
/**
 * The running row, drawn in the Host's composer dock.
 *
 * This is the same mount the built-in 任务 row uses (`id: "todo"`), and that is
 * what makes it immune to scrolling: the dock lives inside
 * `[data-composer-seat]`, which the Host positions over the scrollport instead
 * of leaving it in the transcript's scroll flow. A `sticky` row inside the
 * transcript is re-laid-out on every scroll frame, which reads as shaking.
 *
 * The lane carries only what the row needs to draw; the Reader owns the turn
 * facts and publishes them.
 */
function PinnedClock({ lane }) {
    const [snapshot, setSnapshot] = useState(IDLE_CLOCK);
    useEffect(() => {
        setSnapshot(lane.read());
        return lane.subscribe(() => setSnapshot(lane.read()));
    }, [lane]);
    if (!snapshot.visible)
        return null;
    return (_jsx("div", { className: css.turnClockPin, "data-reader-turn-clock-pin": true, children: _jsx(TurnClock, { phase: "running", startTime: snapshot.startTime, endTime: null, fallbackStart: snapshot.fallbackStart }) }));
}
/** Reuse the native store handle; its framework-owned instance preserves drafts. */
export function installReaderEntry(ctx) {
    const native = ctx.slots.entriesOfSlot('conversation.session')[0]?.store;
    if (!isConversationStore(native))
        throw new Error('DSH Reader cannot bind the native conversation view store.');
    const policy = new ReaderEntryPolicy(readerEntryRequested(location.search), () => {
        const url = new URL(location.href);
        url.searchParams.delete('reader');
        history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
    });
    const lane = createClockLane();
    ctx.provide('betterDisplayClockLane', lane);
    // The dock stack is a flex column sorted by ascending order. The built-in 任务
    // row is `order: 0` and the queue dock is `order: 20`, so 10 lands the clock
    // between them — below the task card, above the input — without depending on
    // plugin load order. `locale` is what gives a dock entry its `t`.
    const disposeClock = ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-better-display-turn-clock',
        order: 10,
        locale: 'chat',
        inject: () => ({ lane })
    }, PinnedClock);
    const disposeEntry = ctx.slots.register({
        name: 'conversation.input.dock',
        id: 'dsh-better-display-entry',
        store: native,
        inject: () => ({ policy })
    }, ReaderEntry);
    return () => {
        disposeEntry();
        disposeClock();
    };
}
//# sourceMappingURL=entry.js.map