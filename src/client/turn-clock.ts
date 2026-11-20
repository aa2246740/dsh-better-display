/**
 * Pure formatting for the turn clock line.
 *
 * Two phases, one row:
 *   running  `HH:mm:ss · 本轮求索中 · 开始于 HH:mm:ss · 已用时 X分XX秒`
 *   done     `HH:mm:ss · ● 本轮求索完成 · 时段 HH:mm:ss – HH:mm:ss · 用时 X分XX秒`
 *
 * The leading reading is the viewer's wall clock and keeps ticking in both
 * phases: it answers "what time is it", which finishing a turn does not change.
 * Only the status word, its motion, and the trailing fields follow the turn.
 *
 * @module
 */

const pad2 = (value: number): string => String(value).padStart(2, '0');

/** One `HH:mm:ss` reading, split so each field can roll on its own. */
export interface WallClockParts {
  hour: string;
  minute: string;
  second: string;
}

/**
 * Split one instant into the three fields of a local `HH:mm:ss` reading.
 * @param time - Unix epoch milliseconds in the viewer's time zone.
 * @returns zero-padded fields, so every field keeps a stable width.
 */
export function wallClockParts(time: number): WallClockParts {
  const date = new Date(time);
  return {
    hour: pad2(date.getHours()),
    minute: pad2(date.getMinutes()),
    second: pad2(date.getSeconds())
  };
}

/**
 * `HH:mm:ss` for one instant, in the viewer's time zone.
 * @param time - Unix epoch milliseconds.
 */
export function formatWallClock(time: number): string {
  const parts = wallClockParts(time);
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}

/** Elapsed time, split for the `已用时` / `用时` field. */
export interface ElapsedParts {
  /** null under a minute, so the line reads `19秒` rather than `0分19秒`. */
  minutes: number | null;
  /** Always two digits once a minute is showing. */
  seconds: string;
}

/**
 * Split elapsed time the way the row prints it.
 * @param ms - Elapsed milliseconds; negatives clamp to zero.
 */
export function elapsedParts(ms: number): ElapsedParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  return minutes > 0
    ? { minutes, seconds: pad2(total % 60) }
    : { minutes: null, seconds: String(total) };
}

/** The two states the row can be in. */
export type TurnPhase = 'running' | 'done';

/**
 * Which phase a Host turn status maps to.
 *
 * Anything but `open` reads as done once the turn exists; `undefined` means the
 * Host has not built the turn yet, and the caller keeps the running phase for
 * the local-echo window instead.
 * @param turnStatus - Host turn status (`open` / `closed`), or undefined.
 */
export function turnPhase(turnStatus: string | undefined): TurnPhase {
  return turnStatus === 'closed' ? 'done' : 'running';
}

/**
 * Whether the row belongs on screen.
 *
 * It belongs to a turn, so it stays from the moment the turn exists — including
 * after the turn closes. It also covers the echo window before the Host admits
 * the first prompt, where `awaiting` is the reader's "sent, nothing back yet".
 * @param turnStatus - Host turn status, or undefined before a turn exists.
 * @param awaiting - The reader's pre-output handover state.
 */
export function rowVisible(turnStatus: string | undefined, awaiting: boolean): boolean {
  if (awaiting) return true;
  return turnStatus === 'open' || turnStatus === 'closed';
}

/**
 * Whether the row is pinned into the Host composer dock.
 *
 * Only while the turn runs. Once it closes the row returns to the transcript,
 * under the last message, where it belongs to that turn's text and scrolls away
 * with the answer.
 * @param visible - the row is on screen at all.
 * @param phase - the turn's phase.
 */
export function pinnedInDock(visible: boolean, phase: TurnPhase): boolean {
  return visible && phase === 'running';
}

/**
 * The closed turn's `start – end` window, as the done row prints it.
 * @param start - Host-stamped turn start in epoch milliseconds.
 * @param end - Host-stamped turn end in epoch milliseconds.
 */
export function formatTurnWindow(start: number, end: number): string {
  return `${formatWallClock(start)} – ${formatWallClock(end)}`;
}

/**
 * Total time a finished turn took.
 * @param start - Host-stamped turn start in epoch milliseconds.
 * @param end - Host-stamped turn end in epoch milliseconds.
 * @returns elapsed milliseconds, clamped at zero for a skewed pair.
 */
export function turnDuration(start: number, end: number): number {
  return Math.max(0, end - start);
}

/**
 * Milliseconds from `now` to the next whole second.
 *
 * Scheduling on this boundary keeps a once-per-second readout aligned to the
 * system clock instead of drifting by however long the first render took.
 * @param now - Current epoch milliseconds.
 * @returns a delay in `(0, 1000]`.
 */
export function untilNextSecond(now: number): number {
  const remainder = ((now % 1000) + 1000) % 1000;
  return remainder === 0 ? 1000 : 1000 - remainder;
}
