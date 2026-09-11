/** Local clock and run-duration labels for reader message chrome. */

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/**
 * Elapsed wall time, matching official Chat `duration.minutes` / `duration.seconds`.
 * @param ms - Elapsed milliseconds (negatives clamp to zero).
 */
export function formatRunDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return minutes > 0 ? `${minutes}分${pad2(seconds)}秒` : `${seconds}秒`
}

/**
 * Settled-turn duration pill, matching official `message.ranFor`.
 * @param ms - Elapsed milliseconds.
 */
export function formatRanFor(ms: number): string {
  return `用时 ${formatRunDuration(ms)}`
}

/**
 * Compact local timestamp. Same calendar day → `HH:mm`; earlier this year →
 * `M月D日 HH:mm`; other years → `YYYY年M月D日 HH:mm`.
 * @param time - Unix epoch ms from the source session event.
 * @param now - Reference instant for the day/year cut.
 */
export function formatMessageClock(time: number, now: number = Date.now()): string {
  const d = new Date(time)
  const n = new Date(now)
  const clock = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  if (
    d.getFullYear() === n.getFullYear()
    && d.getMonth() === n.getMonth()
    && d.getDate() === n.getDate()
  ) {
    return clock
  }
  if (d.getFullYear() === n.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
  }
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${clock}`
}
