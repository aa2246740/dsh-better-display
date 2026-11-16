import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * A group of pictures that can be paged through with the viewer's `‹ 1/3 ›`.
 *
 * The group is what the reader is looking at, not what the document contains:
 *
 *  - a picture produced by a tool call stands alone, because one call yields one
 *    picture
 *  - every picture inside one final answer forms a group, so `2/5` counts that
 *    answer's pictures
 *
 * Membership is by registration rather than by a pre-pass over the Markdown: a
 * pre-pass would have to reproduce the renderer's URL rewriting and its
 * link/image branching exactly, and any drift would show up as a wrong count.
 * Each viewer registers on mount (and unregisters on unmount), so the group is
 * always the set of pictures actually rendered.
 *
 * @module
 */

/** One registered picture. */
export interface ImageGroupMember {
  /** Stable registration key. */
  id: string;
  /** The enlarged URL. */
  src: string;
  /** Alternative text for the viewer. */
  alt: string;
  /** What the caption shows: the authored path, or a description for a blob. */
  caption: string;
}

interface GroupRegistry {
  /** Register in render order; returns the unsubscribe. */
  add: (member: ImageGroupMember) => () => void;
  /** Current members, in the order they first rendered. */
  members: () => ImageGroupMember[];
  /** Bumped whenever membership changes, so consumers re-read. */
  version: number;
}

const GroupContext = createContext<GroupRegistry | null>(null);

/**
 * Provide a page group to the viewers beneath it.
 * @param props - children to wrap.
 */
export function ImageGroupScope({ children }: { children: ReactNode }) {
  // A ref keeps registration from re-rendering the whole subtree on every mount;
  // the version counter is what tells the viewers to re-read.
  const registry = useRef<Map<string, ImageGroupMember>>(new Map());
  const [version, setVersion] = useState(0);
  const value = useMemo<GroupRegistry>(
    () => ({
      add: member => {
        registry.current.set(member.id, member);
        setVersion(current => current + 1);
        return () => {
          registry.current.delete(member.id);
          setVersion(current => current + 1);
        };
      },
      members: () => [...registry.current.values()],
      version
    }),
    [version]
  );
  return <GroupContext.Provider value={value}>{children}</GroupContext.Provider>;
}

/** What a viewer needs to know about its position in the group. */
export interface GroupPosition {
  /** 1-based index, or 1 when standing alone. */
  index: number;
  /** Total members; 1 when standing alone. */
  total: number;
  /** Move by `+1` / `-1`; undefined when there is nowhere to move. */
  step: ((delta: number) => void) | undefined;
}

/**
 * Place a picture within its group.
 *
 * Pictures outside any {@link ImageGroupScope} report `1/1`, which is what a
 * tool-call attachment should show.
 * @param member - this picture; `null` while its source is still unknown.
 * @param openId - the viewer that is currently open, if any.
 * @param setOpenId - switches the open viewer when the reader pages.
 */
export function useGroupPosition(
  member: ImageGroupMember | null,
  openId: string | null,
  setOpenId: (id: string | null) => void
): GroupPosition {
  const registry = useContext(GroupContext);
  const version = registry?.version ?? 0;
  const members = useMemo(() => (registry === null ? [] : registry.members()), [registry, version]);
  const index = member === null ? -1 : members.findIndex(item => item.id === member.id);
  const step = useCallback(
    (delta: number) => {
      const next = members[index + delta];
      if (next === undefined) return;
      setOpenId(next.id);
    },
    [members, index, setOpenId]
  );
  if (index < 0) return { index: 1, total: 1, step: undefined };
  return {
    index: index + 1,
    total: members.length,
    step: members.length > 1 ? step : undefined
  };
}

/** Context a viewer publishes so a paged-to picture knows to open itself. */
const OpenContext = createContext<{
  openId: string | null;
  setOpenId: (id: string | null) => void;
} | null>(null);

/**
 * Share which viewer is open, so `‹` / `›` can move between pictures.
 * @param props - children to wrap.
 */
export function ImageOpenScope({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const value = useMemo(() => ({ openId, setOpenId }), [openId]);
  return <OpenContext.Provider value={value}>{children}</OpenContext.Provider>;
}

/** The shared open-viewer state, or a private one when no scope is present. */
export function useOpenViewer(): {
  openId: string | null;
  setOpenId: (id: string | null) => void;
} {
  const shared = useContext(OpenContext);
  const [localId, setLocalId] = useState<string | null>(null);
  return shared ?? { openId: localId, setOpenId: setLocalId };
}
