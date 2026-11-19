/** Extensions the Host treats as a picture. */
const IMAGE_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico)$/iu;
/**
 * The displayable URL for a destination that names a picture.
 * @param token - the authored destination or token.
 * @param resolver - the owner's path resolver, absent when the view has none.
 * @returns the URL to load, or undefined when the token names no resolvable picture.
 */
export function pictureSourceFor(token, resolver) {
    const bare = token.trim();
    if (!IMAGE_FILE.test(bare.split(/[?#]/u)[0] ?? bare))
        return undefined;
    // A remote destination loads directly; a local one goes through the workspace resolver.
    return /^https?:/iu.test(bare) ? bare : resolver?.resolve(bare);
}
/**
 * The resolved picture sources named inside a run of inline content.
 *
 * Walks links only: `![alt](path)` renders its own picture in place, so it is not
 * something that has to be moved. The chip in a heading renders from the same nodes;
 * this collects what has to be emitted outside.
 * @param children - the inline children to walk.
 * @param resolver - the owner's path resolver.
 * @returns one source per picture reference, in document order.
 */
export function pictureSourcesIn(children, resolver) {
    const found = [];
    const visit = (nodes) => {
        for (const node of nodes) {
            if (node.type === 'link') {
                const resolved = pictureSourceFor(node.url, resolver);
                if (resolved !== undefined)
                    found.push(resolved);
                visit(node.children);
                continue;
            }
            if (node.type === 'image' || node.type === 'imageReference')
                continue;
            if ('children' in node)
                visit(node.children);
        }
    };
    visit(children);
    return found;
}
//# sourceMappingURL=picture-sources.js.map