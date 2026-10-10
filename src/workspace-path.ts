/** Absolute paths accepted by both POSIX and Windows hosts. */
export function isAbsoluteWorkspacePath(path: string): boolean {
  return /^(?:\/|[A-Za-z]:[/\\]|\\\\)/.test(path);
}
