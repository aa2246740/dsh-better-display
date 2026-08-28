/** Transitions.dev Reasoning stream, adapted to appended content, never a loop. */
export const REASON_HOLD = 840;
export const REASON_STEP = 500;
export const REASON_LINES = 2;

export function reasoningTarget(top: number, contentHeight: number, viewportHeight: number, lineHeight: number): number {
  const end = Math.max(0, contentHeight - viewportHeight);
  const current = Math.min(end, Math.max(0, top));
  // Receiving a burst changes the available transcript, never the step size.
  // Only the final, partial step may be shorter than the reference's two lines.
  return Math.min(end, current + Math.max(1, lineHeight) * REASON_LINES);
}
