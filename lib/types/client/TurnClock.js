import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { memo, useEffect, useRef, useState } from 'react';
import css from './Reader.module.css';
import { elapsedParts, formatTurnWindow, untilNextSecond, wallClockParts } from './turn-clock.js';
/**
 * One rolling field of the wall clock.
 *
 * A digit that changed slides out upward while its replacement slides in from
 * below, which is the motion the official clock uses. The sizer keeps the widest
 * value in flow so a roll never reflows the fields to its right, and the roll is
 * skipped entirely once the turn is done: the row becomes a record, and a record
 * does not animate.
 */
const RollField = memo(function RollField({ value, animated }) {
    const previous = useRef(value);
    const changed = previous.current !== value;
    useEffect(() => {
        previous.current = value;
    }, [value]);
    return (_jsxs("span", { className: css.clockField, children: [_jsx("span", { className: css.clockFieldSizer, "aria-hidden": "true", children: value.length > 2 ? '00' : '88' }), _jsx("span", { className: changed && animated
                    ? `${css.clockFieldDigit} ${css.clockFieldEnter}`
                    : css.clockFieldDigit, children: value }, animated ? value : undefined)] }));
});
/** The leading `HH:mm:ss`, ticking every second in both phases. */
const WallClock = memo(function WallClock({ now, animated }) {
    const parts = wallClockParts(now);
    return (_jsxs("span", { className: css.clockTime, children: [_jsx(RollField, { value: parts.hour, animated: animated }), _jsx("span", { "aria-hidden": "true", children: ":" }), _jsx(RollField, { value: parts.minute, animated: animated }), _jsx("span", { "aria-hidden": "true", children: ":" }), _jsx(RollField, { value: parts.second, animated: animated })] }));
});
/** `19秒` / `3分08秒`, with the numbers emphasised exactly as the row does. */
const Duration = memo(function Duration({ ms }) {
    const parts = elapsedParts(ms);
    return parts.minutes === null ? (_jsxs(_Fragment, { children: [_jsx("b", { children: parts.seconds }), " \u79D2"] })) : (_jsxs(_Fragment, { children: [_jsx("b", { children: parts.minutes }), " \u5206 ", _jsx("b", { children: parts.seconds }), " \u79D2"] }));
});
/** One `key value` field; the separators are drawn by the row. */
function Field({ label, children }) {
    return (_jsxs("span", { className: css.turnStatusField, children: [_jsx("span", { className: css.turnStatusKey, children: label }), _jsx("span", { className: css.turnStatusValue, children: children })] }));
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
export const TurnClock = memo(function TurnClock({ phase, startTime, endTime, fallbackStart }) {
    const [now, setNow] = useState(() => Date.now());
    const running = phase === 'running';
    // Re-align on the second boundary every tick, so the readout lands on the
    // system clock instead of drifting by however long the first render took.
    // The tick runs in both phases: only the fields to its right freeze.
    useEffect(() => {
        let timer;
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
    return (_jsxs("div", { className: css.turnStatus, "data-reader-turn-phase": phase, children: [_jsx(WallClock, { now: now, animated: running }), _jsx("span", { className: css.turnStatusSep, "aria-hidden": "true", children: "\u00B7" }), running ? (_jsx("span", { className: css.turnStatusLabel, children: "\u672C\u8F6E\u6C42\u7D22\u4E2D" })) : (_jsxs("span", { className: `${css.turnStatusLabel} ${css.turnStatusLabelDone}`, children: [_jsx("span", { className: css.turnStatusDot, "aria-hidden": "true" }), "\u672C\u8F6E\u6C42\u7D22\u5B8C\u6210"] })), _jsx("span", { className: css.turnStatusSep, "aria-hidden": "true", children: "\u00B7" }), running ? (_jsxs(_Fragment, { children: [start !== null && (_jsxs(Field, { label: "\u5F00\u59CB\u4E8E", children: [wallClockParts(start).hour, ":", wallClockParts(start).minute, ":", wallClockParts(start).second] })), start !== null && (_jsx("span", { className: css.turnStatusSep, "aria-hidden": "true", children: "\u00B7" })), _jsx(Field, { label: "\u5DF2\u7528\u65F6", children: _jsx(Duration, { ms: elapsed }) })] })) : (_jsxs(_Fragment, { children: [window !== null && _jsx(Field, { label: "\u65F6\u6BB5", children: window }), window !== null && (_jsx("span", { className: css.turnStatusSep, "aria-hidden": "true", children: "\u00B7" })), _jsx(Field, { label: "\u7528\u65F6", children: _jsx(Duration, { ms: total }) })] }))] }));
});
//# sourceMappingURL=TurnClock.js.map