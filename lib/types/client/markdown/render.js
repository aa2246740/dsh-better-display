import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
// Adapted from DeepSeek Harness b150a551b8d465e31e418e1b2eaf5e79bbb7d28e (MIT). See THIRD_PARTY_NOTICES.md.
/**
 * Direct mdast→React markdown renderer. Replaces the react-markdown /
 * remark-rehype pipeline with one switch over parsed nodes so streaming can
 * cache frozen blocks as React elements; the rendered DOM is pinned
 * byte-for-byte by `tests/fixtures/markdown-dom` and must not drift.
 *
 * Untrusted-output policy (unchanged from the replaced pipeline): link and
 * image destinations pass a protocol allowlist, images additionally require
 * absolute HTTP(S), raw HTML renders as literal text (no HTML enters the
 * DOM), and KaTeX runs without trusted commands. Fragment-anchor URLs fail
 * the allowlist, so footnote references and back-references render as plain
 * text rather than in-page links.
 *
 * Merge-extensible node unions fall through the documented default (render
 * nothing) rather than ending in assertNever: grammars registered elsewhere
 * may add node types this renderer has no mapping for.
 */
import { Fragment, createElement, useState } from 'react';
import clsx from 'clsx';
import { normalizeUri } from 'micromark-util-sanitize-uri';
import { CodeBlock } from '@deepseek-ai/dsh-client-ui-primitives';
import { renderTexToReact } from './katex.js';
import { McpAppCodeBlock, StreamingMcpAppPlaceholder } from '../McpAppFrame.js';
import { isMcpAppCodeBlock, extractMcpAppTitle, extractMcpAppHeight } from '../mcp-app.js';
import css from './MarkdownText.module.css';
function sanitizeUrl(url) {
    try {
        switch (new URL(url).protocol) {
            case 'http:':
            case 'https:':
            case 'mailto:':
                return url;
            default:
                return '';
        }
    }
    catch {
        // Relative and otherwise unparsable destinations are disallowed alongside
        // disallowed protocols; new URL() has no other failure mode for strings.
        return '';
    }
}
function remoteImageUrl(url) {
    try {
        const protocol = new URL(url).protocol;
        return protocol === 'http:' || protocol === 'https:' ? url : undefined;
    }
    catch {
        // Same single failure mode as above: not an absolute URL.
        return undefined;
    }
}
/**
 * Create an empty {@link ReferenceTargets}.
 * @returns Fresh empty maps.
 */
export function createReferenceTargets() {
    return { definitions: new Map(), footnotes: new Map() };
}
/**
 * Record every definition and footnote definition under `nodes` into
 * `targets`, depth-first, keeping the first definition per identifier.
 * @param nodes - Subtrees to walk (top-level blocks or any nested children).
 * @param targets - Accumulator, typically shared across incremental segments.
 */
export function collectReferenceTargets(nodes, targets) {
    for (const node of nodes) {
        if (node.type === 'definition') {
            const id = node.identifier.toUpperCase();
            if (!targets.definitions.has(id))
                targets.definitions.set(id, node);
        }
        else if (node.type === 'footnoteDefinition') {
            const id = node.identifier.toUpperCase();
            if (!targets.footnotes.has(id))
                targets.footnotes.set(id, node);
        }
        if ('children' in node)
            collectReferenceTargets(node.children, targets);
    }
}
/**
 * Render top-level blocks. Nodes that render nothing (definitions, unmapped
 * types) are dropped rather than kept as null placeholders, matching the
 * replaced pipeline's child lists so separator newlines land identically.
 * @param blocks - Blocks with their stream-stable render keys.
 * @param context - The pass state; footnote numbering mutates in document order.
 * @returns One React node per rendered block.
 */
export function renderBlocks(blocks, context) {
    return blocks
        .map(block => renderNode(block.node, block.key, {
        ...context,
        sourceOffset: block.key - (block.node.position?.start.offset ?? block.key),
    }))
        .filter(element => element !== null);
}
/**
 * Interleave the newline text nodes the replaced pipeline emitted between
 * block-level children. They are invisible between elements but coalesce
 * into adjacent literal raw-HTML text, where the DOM parity fixtures pin
 * them.
 * @param elements - Rendered block children with empty renders already dropped.
 * @param edges - Also emit the leading and trailing newline (hast's loose wrap).
 * @returns The interleaved children.
 */
export function wrapBlockChildren(elements, edges) {
    const wrapped = [];
    for (const element of elements) {
        if (edges || wrapped.length > 0)
            wrapped.push('\n');
        wrapped.push(element);
    }
    if (edges && elements.length > 0)
        wrapped.push('\n');
    return wrapped;
}
/** Render container children into {@link BlockEntry} values, dropping empty renders. */
function renderBlockEntries(blocks, context) {
    const entries = [];
    for (const [index, block] of blocks.entries()) {
        if (block.type === 'paragraph') {
            entries.push({ paragraph: renderChildren(block.children, context) });
        }
        else {
            const element = renderNode(block, index, context);
            if (element !== null)
                entries.push({ element });
        }
    }
    return entries;
}
function renderChildren(nodes, context) {
    return nodes.map((node, index) => renderNode(node, index, context));
}
function renderNode(node, key, context) {
    switch (node.type) {
        case 'text':
            return context.renderText ? context.renderText(node.value, (context.sourceOffset ?? 0) + (node.position?.start.offset ?? 0)) : node.value;
        case 'paragraph':
            return _jsx("p", { children: renderChildren(node.children, context) }, key);
        case 'heading':
            return createElement(`h${node.depth}`, { key }, ...renderChildren(node.children, context));
        case 'blockquote':
            return (_jsx("blockquote", { children: wrapBlockChildren(renderChildren(node.children, { ...context, inBlockquote: true }).filter(child => child !== null), true) }, key));
        case 'thematicBreak':
            return _jsx("hr", {}, key);
        case 'break':
            // The replaced pipeline emitted a newline text node after each <br>.
            return _jsxs(Fragment, { children: [_jsx("br", {}), '\n'] }, key);
        case 'strong':
            return _jsx("strong", { children: renderChildren(node.children, context) }, key);
        case 'emphasis':
            return _jsx("em", { children: renderChildren(node.children, context) }, key);
        case 'delete':
            return _jsx("del", { children: renderChildren(node.children, context) }, key);
        case 'inlineCode': {
            // Parity with mdast-util-to-hast: inline code renders line endings as spaces.
            const value = node.value.replace(/\r?\n|\r/g, ' ');
            // Native code chips are inline-flex. Keep a single inline formatting
            // context so motion spans do not become flex items or drop code spaces.
            const content = context.renderText ? _jsx("span", { children: context.renderText(value, (context.sourceOffset ?? 0) + (node.position?.start.offset ?? 0), true) }) : value;
            // An inline-code token that is entirely an absolute HTTP(S) URL keeps
            // its code chrome and gains the same safe external anchor as a link;
            // commands, partial URLs, and other schemes stay inert. The value is
            // authored text, not a parsed destination, so no normalizeUri: port,
            // path, and query render unchanged.
            const href = inlineCodeHttpUrl(value);
            if (href !== undefined)
                return _jsx("code", { children: renderSafeLink(href, [content], 'link') }, key);
            // A token the owner's file-mention vocabulary recognizes opens that
            // file; the resolver, not this renderer, decides what names a file.
            // Inside an anchor the token stays inert — a button cannot nest there.
            const mention = context.inLink === true ? undefined : context.fileMentions?.resolve(value);
            if (mention !== undefined) {
                return (_jsx("code", { children: _jsx("button", { type: "button", className: css.fileMention, title: mention.title, "aria-label": mention.label, onClick: mention.open, children: content }) }, key));
            }
            return _jsx("code", { children: content }, key);
        }
        case 'html':
            // No HTML parser enters the pipeline: raw HTML stays literal text.
            return context.renderText ? context.renderText(node.value, (context.sourceOffset ?? 0) + (node.position?.start.offset ?? 0)) : node.value;
        case 'code': {
            const code = renderCode(node, key, context);
            return context.renderAtom ? _jsx(Fragment, { children: context.renderAtom(code, (context.sourceOffset ?? 0) + (node.position?.start.offset ?? 0)) }, key) : code;
        }
        case 'math':
            return _jsx(Fragment, { children: renderTexToReact(node.value, true) }, key);
        case 'inlineMath':
            return _jsx(Fragment, { children: renderTexToReact(node.value, false) }, key);
        case 'list':
            return renderList(node, key, context);
        case 'listItem':
            // Reachable only in hand-built trees: the grammar emits items inside lists.
            return renderListItem(node, listItemLoose(node), key, context);
        case 'table':
            return renderTable(node, key, context);
        case 'link':
            return renderAnchor(node.url, renderChildren(node.children, { ...context, inLink: true }), key);
        case 'linkReference':
            return renderLinkReference(node, key, context);
        case 'image':
            return renderImage(node.url, node.alt ?? '', key, context);
        case 'imageReference':
            return renderImageReference(node, key, context);
        case 'footnoteReference':
            return renderFootnoteReference(node, key, context);
        case 'definition':
        case 'footnoteDefinition':
            // Targets render elsewhere: definitions resolve references in place;
            // footnote bodies render in the trailing section.
            return null;
        default:
            // Documented default for the merge-extensible union: node types without
            // a mapping (tableRow/tableCell outside a table, frontmatter, future
            // grammar contributions) render nothing.
            return null;
    }
}
function renderCode(node, key, context) {
    const language = node.lang ?? undefined;
    if (node.value === '') {
        // Parity: the replaced pipeline kept the stock <pre> for an empty fence.
        return (_jsx("pre", { children: _jsx("code", { className: language === undefined ? undefined : `language-${language}` }) }, key));
    }
    // The replaced pipeline recovered the grammar id from the hast class with
    // /language-([\w-]+)/, which truncates at the first non-word character.
    const lang = language === undefined ? undefined : /^[\w-]+/.exec(language)?.[0];
    if (isMcpAppCodeBlock(node.lang, node.meta, node.value)) {
        const title = extractMcpAppTitle(node.meta, node.value);
        const initialHeight = extractMcpAppHeight(node.meta);
        if (context.streaming) {
            return _jsx(StreamingMcpAppPlaceholder, { title: title }, key);
        }
        return _jsx(McpAppCodeBlock, { html: node.value, title: title, initialHeight: initialHeight }, key);
    }
    if (!context.streaming && lang === 'math') {
        // ```math fences render as display TeX once settled (rehype-katex parity);
        // its text extraction saw the code block's trailing newline.
        return _jsx(Fragment, { children: renderTexToReact(`${node.value}\n`, true) }, key);
    }
    return (_jsx(CodeBlock, { 
        // The replaced hast pipeline appended one synthetic newline that
        // CodeBlock's display trim removes; feeding the bare value would make
        // that trim eat a REAL trailing blank line inside the fence instead.
        code: `${node.value}\n`, lang: context.streaming ? undefined : lang, copyLabel: context.codeLabels?.copyLabel ?? '复制代码', copiedLabel: context.codeLabels?.copiedLabel ?? '已复制' }, key));
}
/** A list is loose when it or any of its items is spread; every item then keeps its paragraphs. */
function listLoose(list) {
    return (list.spread ?? false) || list.children.some(listItemLoose);
}
function listItemLoose(item) {
    return item.spread ?? item.children.length > 1;
}
function renderList(node, key, context) {
    const loose = listLoose(node);
    const properties = {};
    if (typeof node.start === 'number' && node.start !== 1)
        properties.start = node.start;
    if (node.children.some(item => typeof item.checked === 'boolean')) {
        properties.className = 'contains-task-list';
    }
    return createElement(node.ordered === true ? 'ol' : 'ul', { key, ...properties }, ...node.children.map((item, index) => renderListItem(item, loose, index, context)));
}
function renderListItem(item, loose, key, context) {
    const entries = renderBlockEntries(item.children, context);
    const task = typeof item.checked === 'boolean';
    if (task) {
        const checkbox = _jsx("input", { type: "checkbox", checked: item.checked === true, disabled: true }, "task-checkbox");
        const head = entries[0];
        if (head !== undefined && 'paragraph' in head) {
            head.paragraph = head.paragraph.length > 0 ? [checkbox, ' ', ...head.paragraph] : [checkbox];
        }
        else {
            entries.unshift({ paragraph: [checkbox] });
        }
    }
    // Newline placement and tight-paragraph unwrapping mirror
    // mdast-util-to-hast's list-item handler: a newline before every child
    // except a tight leading paragraph, and after a trailing non-paragraph
    // (or any trailing child when loose).
    const parts = [];
    for (const [index, entry] of entries.entries()) {
        const isParagraph = 'paragraph' in entry;
        if (loose || index !== 0 || !isParagraph)
            parts.push('\n');
        if (!isParagraph)
            parts.push(entry.element);
        else if (loose)
            parts.push(_jsx("p", { children: entry.paragraph }, `p-${index}`));
        else
            parts.push(_jsx(Fragment, { children: entry.paragraph }, `p-${index}`));
    }
    const tail = entries[entries.length - 1];
    if (tail !== undefined && (loose || !('paragraph' in tail)))
        parts.push('\n');
    return (_jsx("li", { className: task ? 'task-list-item' : undefined, children: parts }, key));
}
function renderTable(node, key, context) {
    const align = node.align ?? null;
    const [headRow, ...bodyRows] = node.children;
    const columns = align === null ? headRow?.children.length ?? 0 : align.length;
    // Four or more columns read as a comparison matrix: the block keeps the
    // table at natural width and exposes the stable `md-table-wide` hook so a
    // hosting layout (the chat transcript) can widen it past the message
    // column. Narrower tables — and any table inside a blockquote — fill the
    // column and wrap instead (deepsuite chat TableWrapper parity).
    const wide = columns >= 4 && context.inBlockquote !== true;
    return (_jsx("div", { className: clsx(css.tableScroll, wide ? 'md-table-wide' : css.tableFill), tabIndex: wide ? 0 : undefined, children: _jsxs("table", { children: [headRow !== undefined && _jsx("thead", { children: renderTableRow(headRow, 'th', align, 0, context) }), bodyRows.length > 0 && (_jsx("tbody", { children: bodyRows.map((row, index) => renderTableRow(row, 'td', align, index + 1, context)) }))] }) }, key));
}
function renderTableRow(row, cellTag, align, key, context) {
    // With column alignment present, every row renders exactly one cell per
    // column, padding or truncating the row (mdast-util-to-hast parity).
    const length = align === null ? row.children.length : align.length;
    const cells = [];
    for (let index = 0; index < length; index++) {
        const cell = row.children[index];
        const alignValue = align?.[index];
        cells.push(createElement(cellTag, 
        // hast-util-to-jsx-runtime's default tableCellAlignToStyle turned the
        // deprecated align attribute into an inline style; keep that DOM.
        { key: index, style: alignValue == null ? undefined : { textAlign: alignValue } }, ...(cell === undefined ? [] : renderChildren(cell.children, context))));
    }
    return _jsx("tr", { children: cells }, key);
}
/** Anchor over an already-authored href: allowlisted or unwrapped, external links get the safe attributes. */
function renderSafeLink(href, children, key) {
    const safeHref = sanitizeUrl(href);
    if (safeHref === '')
        return _jsx(Fragment, { children: children }, key);
    const external = ['http:', 'https:'].includes(new URL(safeHref).protocol);
    return (_jsx("a", { href: safeHref, ...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {}), children: children }, key));
}
/** Anchor over a parsed markdown destination, which hast normalized before the allowlist saw it. */
function renderAnchor(url, children, key) {
    return renderSafeLink(normalizeUri(url), children, key);
}
/**
 * The complete inline-code value when it is exactly an absolute HTTP(S) URL
 * (no surrounding whitespace); anything else stays inert code.
 */
function inlineCodeHttpUrl(value) {
    if (value.trim() !== value)
        return undefined;
    try {
        const protocol = new URL(value).protocol;
        return protocol === 'http:' || protocol === 'https:' ? value : undefined;
    }
    catch {
        // Not an absolute URL at all — the only way new URL() rejects a string.
        return undefined;
    }
}
function renderImage(url, alt, key, context) {
    // RC2 semantics, including the revalidation of a trusted vocabulary result.
    const remote = remoteImageUrl(sanitizeUrl(normalizeUri(url)));
    const rewritten = remote === undefined ? context.pathImages?.resolve(url) : undefined;
    let imageSrc = remote;
    if (rewritten !== undefined) {
        try {
            const parsed = new URL(rewritten);
            if (['http:', 'https:', 'blob:', 'data:'].includes(parsed.protocol) || rewritten.startsWith('dsh-app://app/api/file?'))
                imageSrc = rewritten;
        }
        catch { /* A vocabulary result must be an absolute URL. */ }
    }
    if (imageSrc === undefined) {
        return _jsx("span", { className: css.imageAlt, children: alt }, key);
    }
    return _jsx(MarkdownImage, { src: imageSrc, alt: alt, destination: url }, `${key}:${imageSrc}`);
}
function MarkdownImage({ src, alt, destination }) {
    const [failed, setFailed] = useState(false);
    if (failed)
        return _jsx("span", { className: css.imageAlt, children: alt || destination });
    return (_jsx("img", { className: css.image, src: src, alt: alt, onError: () => { setFailed(true); }, loading: "lazy", decoding: "async", referrerPolicy: "no-referrer" }));
}
/** The bracketed source text a reference reverts to when its definition is missing. */
function referenceSuffix(node) {
    if (node.referenceType === 'collapsed')
        return '][]';
    if (node.referenceType === 'full')
        return `][${node.label ?? node.identifier}]`;
    return ']';
}
function renderLinkReference(node, key, context) {
    const definition = context.targets.definitions.get(node.identifier.toUpperCase());
    if (definition === undefined) {
        // The grammar only emits references whose definitions exist somewhere in
        // the same parse, but incremental segments and hand-built trees may still
        // present unresolved ones: revert to the bracketed source text — which is
        // not an anchor, so mentions inside it stay live.
        return _jsxs(Fragment, { children: ['[', renderChildren(node.children, context), referenceSuffix(node)] }, key);
    }
    return renderAnchor(definition.url, renderChildren(node.children, { ...context, inLink: true }), key);
}
function renderImageReference(node, key, context) {
    const definition = context.targets.definitions.get(node.identifier.toUpperCase());
    if (definition === undefined)
        return `![${node.alt ?? ''}${referenceSuffix(node)}`;
    return renderImage(definition.url, node.alt ?? '', key, context);
}
function renderFootnoteReference(node, key, context) {
    const id = node.identifier.toUpperCase();
    const seen = context.footnoteCounts.get(id);
    if (seen === undefined)
        context.footnoteOrder.push(id);
    context.footnoteCounts.set(id, (seen ?? 0) + 1);
    // The in-page anchor fails the protocol allowlist, so only the numbered
    // superscript renders (matching the replaced pipeline's unwrapped link).
    return _jsx("sup", { children: String(context.footnoteOrder.indexOf(id) + 1) }, key);
}
/**
 * Render the trailing footnote section for every footnote referenced during
 * the pass, in first-reference order, with one plain-text back-reference
 * marker per rendered reference.
 * @param context - The pass state after all blocks rendered.
 * @returns The section, or null when no referenced footnote has a definition.
 */
export function renderFootnoteSection(context) {
    const items = [];
    for (const id of context.footnoteOrder) {
        const definition = context.targets.footnotes.get(id);
        if (definition === undefined)
            continue;
        const count = context.footnoteCounts.get(id) ?? 0;
        const backrefs = [];
        for (let reference = 1; reference <= count; reference++) {
            if (backrefs.length > 0)
                backrefs.push(' ');
            backrefs.push('↩');
            if (reference > 1)
                backrefs.push(_jsx("sup", { children: String(reference) }, `re-${reference}`));
        }
        const entries = renderBlockEntries(definition.children, context);
        const tail = entries[entries.length - 1];
        const body = entries.map((entry, index) => ('paragraph' in entry
            ? (_jsxs("p", { children: [entry.paragraph, entry === tail && _jsxs(_Fragment, { children: [' ', backrefs] })] }, `p-${index}`))
            : entry.element));
        // Without a trailing paragraph the back-references join the block list
        // itself (and pick up the wrap newlines), as in the replaced pipeline.
        if (tail === undefined || !('paragraph' in tail))
            body.push(...backrefs);
        items.push(_jsx("li", { id: `user-content-fn-${normalizeUri(id.toLowerCase())}`, children: wrapBlockChildren(body, true) }, id));
    }
    if (items.length === 0)
        return null;
    return (_jsxs("section", { "data-footnotes": true, className: "footnotes", children: [_jsx("h2", { id: "footnote-label", className: "sr-only", children: "Footnotes" }), _jsx("ol", { children: items })] }, "footnotes"));
}
//# sourceMappingURL=render.js.map