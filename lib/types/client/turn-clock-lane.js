/**
 * The Reader-to-dock channel for the running clock row.
 *
 * While a turn runs the row is drawn by the Host's `conversation.input.dock` —
 * the same mount the built-in 任务 row uses. That placement is the whole point:
 * the dock sits inside `[data-composer-seat]`, which the Host positions over the
 * scrollport, so a scroll never re-lays-out the row. A `sticky` row inside the
 * transcript is re-laid-out on every scroll frame, which reads as shaking.
 *
 * The dock is a separate registration and cannot see the Reader's props, and the
 * turn timeline is not a projection, so it cannot use `useProjection` either.
 * This lane is the smallest thing that bridges them: the Reader publishes, the
 * dock subscribes. It carries three fields and nothing else.
 *
 * @module
 */
/** The value before any turn publishes: nothing to draw. */
export const IDLE_CLOCK = { visible: false, startTime: null, fallbackStart: null };
/**
 * Whether two snapshots describe the same row state.
 * @param a - left snapshot.
 * @param b - right snapshot.
 */
function sameClock(a, b) {
    return (a.visible === b.visible && a.startTime === b.startTime && a.fallbackStart === b.fallbackStart);
}
/**
 * Create one lane.
 * @returns the channel; `publish` ignores a snapshot equal to the current one,
 * so the dock never re-renders for a tick that changed nothing.
 */
export function createClockLane() {
    let snapshot = IDLE_CLOCK;
    const listeners = new Set();
    const read = () => snapshot;
    const publish = (next) => {
        if (sameClock(next, snapshot))
            return;
        snapshot = next;
        for (const listener of [...listeners])
            listener();
    };
    const subscribe = (listener) => {
        listeners.add(listener);
        return () => {
            listeners.delete(listener);
        };
    };
    return { read, publish, subscribe };
}
//# sourceMappingURL=turn-clock-lane.js.map