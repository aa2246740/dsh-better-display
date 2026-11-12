import { memo, useEffect, useRef, useState } from 'react';
import css from './Reader.module.css';
import {
  elapsedParts,
  formatTurnWindow,
  untilNextSecond,
  wallClockParts,
  type TurnPhase,
  type WallClockParts
} from './turn-clock.js';

/**
 * One rolling field of the wall clock.
 *
 * A digit that changed slides out upward while its replacement slides in from
 * below, which is the motion the official clock uses. The sizer keeps the widest
 * value in flow so a roll never reflows the fields to its right, and the roll is
 * skipped entirely once the turn is done: the row becomes a record, and a record
 * does not animate.
 */
const RollField = memo(function RollField({
  value,
  animated
}: {
  value: string;
  animated: boolean;
}) {
  const previous = useRef(value);
  const changed = previous.current !== value;
  useEffect(() => {
    previous.current = value;
  }, [value]);
  return (
    <span className={css.clockField}>
      <span className={css.clockFieldSizer} aria-hidden="true">
        {value.length > 2 ? '00' : '88'}
      </span>
      <span
        className={
          changed && animated
            ? `${css.clockFieldDigit} ${css.clockFieldEnter}`
            : css.clockFieldDigit
        }
        key={animated ? value : undefined}
      >
        {value}
      </span>
    </span>
  );
});

/** The leading `HH:mm:ss`, ticking every second in both phases. */
const WallClock = memo(function WallClock({ now, animated }: { now: number; animated: boolean }) {
  const parts: WallClockParts = wallClockParts(now);
  return (
    <span className={css.clockTime}>
      <RollField value={parts.hour} animated={animated} />
      <span aria-hidden="true">:</span>
      <RollField value={parts.minute} animated={animated} />
      <span aria-hidden="true">:</span>
      <RollField value={parts.second} animated={animated} />
    </span>
  );
});

/** `19秒` / `3分08秒`, with the numbers emphasised exactly as the row does. */
const Duration = memo(function Duration({ ms }: { ms: number }) {
  const parts = elapsedParts(ms);
  return parts.minutes === null ? (
    <>
      <b>{parts.seconds}</b> 秒
    </>
  ) : (
    <>
      <b>{parts.minutes}</b> 分 <b>{parts.seconds}</b> 秒
    </>
  );
});

/** One `key value` field; the separators are drawn by the row. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className={css.turnStatusField}>
      <span className={css.turnStatusKey}>{label}</span>
      <span className={css.turnStatusValue}>{children}</span>
    </span>
  );
}

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
export const TurnClock = memo(function TurnClock({
  phase,
  startTime,
  endTime,
  fallbackStart
}: {
  phase: TurnPhase;
  startTime: number | null;
  endTime: number | null;
  fallbackStart: number | null;
}) {
  const [now, setNow] = useState(() => Date.now());
  const running = phase === 'running';

  // Re-align on the second boundary every tick, so the readout lands on the
  // system clock instead of drifting by however long the first render took.
  // The tick runs in both phases: only the fields to its right freeze.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      timer = setTimeout(tick, untilNextSecond(current));
    };
    timer = setTimeout(tick, untilNextSecond(Date.now()));
    return () => clearTimeout(timer);
  }, []);

  const start = startTime ?? fallbackStart;
  const elapsed = start === null ? 0 : now - start;
  const window = start !== null && endTime !== null ? formatTurnWindow(start, endTime) : null;
  const total = start !== null && endTime !== null ? endTime - start : elapsed;

  return (
    <div className={css.turnStatus} data-reader-turn-phase={phase}>
      <WallClock now={now} animated={running} />
      <span className={css.turnStatusSep} aria-hidden="true">
        ·
      </span>
      {running ? (
        <span className={css.turnStatusLabel}>本轮求索中</span>
      ) : (
        <span className={`${css.turnStatusLabel} ${css.turnStatusLabelDone}`}>
          <span className={css.turnStatusDot} aria-hidden="true" />
          本轮求索完成
        </span>
      )}
      <span className={css.turnStatusSep} aria-hidden="true">
        ·
      </span>
      {running ? (
        <>
          {start !== null && (
            <Field label="开始于">
              {wallClockParts(start).hour}:{wallClockParts(start).minute}:
              {wallClockParts(start).second}
            </Field>
          )}
          {start !== null && (
            <span className={css.turnStatusSep} aria-hidden="true">
              ·
            </span>
          )}
          <Field label="已用时">
            <Duration ms={elapsed} />
          </Field>
        </>
      ) : (
        <>
          {window !== null && <Field label="时段">{window}</Field>}
          {window !== null && (
            <span className={css.turnStatusSep} aria-hidden="true">
              ·
            </span>
          )}
          <Field label="用时">
            <Duration ms={total} />
          </Field>
        </>
      )}
    </div>
  );
});
