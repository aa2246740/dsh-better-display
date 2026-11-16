/**
 * Pure helpers for the picture pager.
 *
 * Kept apart from `image-group.tsx` so the wording and the stepping rules can be
 * asserted without a DOM: the component holds React state, this holds the rules.
 *
 * A group is what the reader is looking at, not what the document holds:
 *
 *  - a picture produced by a tool call stands alone, because one call yields one
 *    picture;
 *  - every picture inside one answer forms a group, so `2/5` counts that
 *    answer's pictures.
 *
 * @module
 */

/** One member of a page group. */
export interface GroupEntry {
  /** Registration key. */
  id: string;
  /** The enlarged URL, used to keep the viewer showing the right picture. */
  src: string;
}

/** A page group in registration order. */
export interface GroupState {
  entries: readonly GroupEntry[];
}

/** No group: a lone picture. */
export const IDLE_GROUP: GroupState = { entries: [] };

/**
 * What a title bar shows for a picture.
 *
 * A tool attachment may carry no file name, and a Markdown picture may carry no
 * destination, so the fallback chain has to end somewhere non-blank.
 * @param destination - the authored path, when there is one.
 * @param alt - alternative text, the next best description.
 * @returns text safe to render in the caption.
 */
export function groupCaption(destination: string | undefined, alt: string): string {
  const path = destination?.trim();
  if (path !== undefined && path !== '') return path;
  const text = alt.trim();
  return text === '' ? '图片' : text;
}

/**
 * The members of a group.
 * @param group - the group state.
 * @param id - the picture being viewed.
 * @returns every entry; the consumer locates `id` within it.
 */
export function groupMembers(group: GroupState, id: string): readonly GroupEntry[] {
  void id;
  return group.entries;
}

/**
 * The picture one step away, or `null` at the end of the group.
 *
 * A lone picture has no neighbour, which is what keeps the `‹ ›` controls off a
 * tool-call attachment.
 * @param group - the group state.
 * @param id - the picture being viewed.
 * @param delta - `+1` for next, `-1` for previous.
 * @returns the neighbour's id, or null when there is none.
 */
export function stepTarget(group: GroupState, id: string, delta: number): string | null {
  if (group.entries.length < 2) return null;
  const index = group.entries.findIndex(entry => entry.id === id);
  if (index < 0) return null;
  return group.entries[index + delta]?.id ?? null;
}
