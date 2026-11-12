import { type TurnPhase } from './turn-clock.js';
/**
 * The turn clock row.
 *
 * Running  `HH:mm:ss · 本轮求索中 · 开始于 HH:mm:ss · 已用时 X分XX秒`
 * Done     `HH:mm:ss · ● 本轮求索完成 · 时段 HH:mm:ss – HH:mm:ss · 用时 X分XX秒`
 *
 * The leading reading is the viewer's own wall clock, so it keeps ticking in
 * both phases: what time it is does not change because a turn finished. The
 * status word keeps its shimmer while the turn runs and goes static when it
 * closes, and the finished row gains a dot to mark success.
 * @param props - phase plus the Host-stamped start/end, and an anchor for the
 * window before the Host admits the turn.
 */
export declare const TurnClock: import("react").MemoExoticComponent<({ phase, startTime, endTime, fallbackStart }: {
    phase: TurnPhase;
    startTime: number | null;
    endTime: number | null;
    fallbackStart: number | null;
}) => import("react").JSX.Element>;
//# sourceMappingURL=TurnClock.d.ts.map