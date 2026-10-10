import { isAbsoluteWorkspacePath } from '../workspace-path.js';

export type DeliverableOpenMode = 'external' | 'sidebar';

export interface OpenModeSnapshot {
  getSnapshot: () => { deliverableOpenMode?: DeliverableOpenMode };
  subscribe?: (fn: () => void) => () => void;
}

export function deliverableOpenModeOf(value: unknown): DeliverableOpenMode {
  return value === 'sidebar' ? 'sidebar' : 'external';
}

export function modeFromSnapshot(store: OpenModeSnapshot | undefined): DeliverableOpenMode {
  try {
    return deliverableOpenModeOf(store?.getSnapshot()?.deliverableOpenMode);
  } catch {
    return 'external';
  }
}

/** Workspace-folder affordances stay on the OS opener, not the Sidebar switch. */
export function isFolderOpenPath(path: string): boolean {
  return path === '.' || path === '';
}

function encodeSegment(segment: string): string {
  return encodeURIComponent(segment).replace(/%3A/gi, ':');
}

function encodePath(path: string): string {
  return path.split('/').map(encodeSegment).join('/');
}

/**
 * Session-scoped `dsh-resource://file/session/<id>/…` address.
 * Matches official `fileAddressFor` / `sessionFileAddress` (0.1.5).
 */
export function fileAddressFor(sessionId: string, cwd: string | undefined, path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const address = (relative: string): string => {
    const cleaned = relative.replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    return `dsh-resource://file/session/${encodeSegment(sessionId)}/${encodePath(cleaned)}`;
  };
  if (!isAbsoluteWorkspacePath(normalized)) return address(normalized);
  const root = cwd === undefined ? '' : cwd.replace(/\\/g, '/').replace(/\/+$/, '');
  if (root !== '' && normalized === root) return address('');
  if (root !== '' && normalized.startsWith(`${root}/`)) return address(normalized.slice(root.length + 1));
  return address(normalized);
}

export function resolveOpenWorkspacePath(
  cwd: string | undefined,
  path: string,
  resolveWorkspacePath: (cwd: string | undefined, path: string) => string,
): string {
  return isFolderOpenPath(path) ? (cwd ?? '.') : resolveWorkspacePath(cwd, path);
}

export async function openDeliverableFile(args: {
  path: string;
  mode: DeliverableOpenMode;
  sessionId: string;
  cwd: string | undefined;
  resolveWorkspacePath: (cwd: string | undefined, path: string) => string;
  openExternal: (absolutePath: string) => Promise<void>;
  openSidebar?: (address: string) => void;
  fileAddressFor?: (sessionId: string, cwd: string | undefined, path: string) => string;
  warn?: (message: string, extra?: unknown) => void;
}): Promise<'sidebar' | 'external'> {
  const targetPath = resolveOpenWorkspacePath(args.cwd, args.path, args.resolveWorkspacePath);
  const useSidebar = args.mode === 'sidebar' && !isFolderOpenPath(args.path);
  if (useSidebar) {
    if (typeof args.openSidebar !== 'function') {
      args.warn?.('[dsh-better-display] sidebarRight.openResource is not available; falling back to system app');
    } else {
      try {
        const address = (args.fileAddressFor ?? fileAddressFor)(args.sessionId, args.cwd, args.path);
        args.openSidebar(address);
        return 'sidebar';
      } catch (error) {
        args.warn?.('[dsh-better-display] sidebar open failed; falling back to system app', error);
      }
    }
  }
  await args.openExternal(targetPath);
  return 'external';
}
