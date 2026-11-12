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

/** What the dock needs in order to draw the running row. */
export interface ClockSnapshot {
  /** True while a turn runs and the row belongs in the composer dock. */
  visible: boolean;
  /** Host-stamped turn start, in epoch milliseconds. */
  startTime: number | null;
  /** The reader's pre-output anchor, used until the Host stamps a start. */
  fallbackStart: number | null;
}

/** The value before any turn publishes: nothing to draw. */
export const IDLE_CLOCK: ClockSnapshot = { visible: false, startTime: null, fallbackStart: null };

/** The channel both sides share. */
export interface ClockLane {
  /** Read the current value. */
  read: () => ClockSnapshot;
  /** Publish a value; a no-op when every field already matches. */
  publish: (next: ClockSnapshot) => void;
  /** Observe changes; returns the unsubscribe. */
  subscribe: (listener: () => void) => () => void;
}

/**
 * Whether two snapshots describe the same row state.
 * @param a - left snapshot.
 * @param b - right snapshot.
 */
function sameClock(a: ClockSnapshot, b: ClockSnapshot): boolean {
  return (
    a.visible === b.visible && a.startTime === b.startTime && a.fallbackStart === b.fallbackStart
  );
}

/**
 * Create one lane.
 * @returns the channel; `publish` ignores a snapshot equal to the current one,
 * so the dock never re-renders for a tick that changed nothing.
 */
export function createClockLane(): ClockLane {
  let snapshot = IDLE_CLOCK;
  const listeners = new Set<() => void>();
  const read = () => snapshot;
  const publish = (next: ClockSnapshot) => {
    if (sameClock(next, snapshot)) return;
    snapshot = next;
    for (const listener of [...listeners]) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };
  return { read, publish, subscribe };
}
