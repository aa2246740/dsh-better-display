/** Absolute paths accepted by both POSIX and Windows hosts. */
export function isAbsoluteWorkspacePath(path) {
    return /^(?:\/|[A-Za-z]:[/\\]|\\\\)/.test(path);
}
//# sourceMappingURL=workspace-path.js.map