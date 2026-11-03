/**
 * Whether the host composer seat stays usable for the view that is on screen.
 *
 * Harness 0.2.1-rc.5 always mounts `[data-composer-seat]` beside the active
 * conversation view (`ConversationContent`). `dsh-claude-style` 0.19.x then
 * sets `data-dsh-claude-composer-hidden` on that conversation root whenever
 * the first tab (对话 / `chat`) is not selected, and hides the seat with
 * `display: none !important`. Reader is the only view this package mounts, so
 * the restore rule in `Reader.module.css` matches only while 阅读 is showing.
 * 轨迹 and other tabs keep the skin's own choice.
 */
export function hostComposerUsable(input: {
  /** The skin has marked this conversation root hidden. */
  skinHidesSeat: boolean;
  /** The reader root is mounted. The host renders only the active view. */
  readerMounted: boolean;
}): boolean {
  if (!input.skinHidesSeat) return true;
  return input.readerMounted;
}

/**
 * Beats the skin rule
 * `body[data-dsh-claude-style][data-dsh-claude-composer-active] [data-dsh-claude-composer-hidden] [data-composer-seat]`
 * and only while `[data-dsh-better-display]` is under that root.
 */
export const READER_COMPOSER_RESTORE =
  'html body[data-dsh-claude-style][data-dsh-claude-composer-active] [data-dsh-claude-composer-hidden]:has([data-dsh-better-display]) [data-composer-seat]';
