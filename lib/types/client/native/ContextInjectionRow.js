import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { DisclosureRow, IconBrowseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ReferenceIcon } from './ReferenceIcon.js';
import { contextBody } from './ContextBody.js';
import { toolUpdateRows } from './tool-update.js';
import css from './ContextInjectionRow.module.css';
/**
 * Render logged context with the Tool calls disclosure chrome from Figma.
 *
 * The header names the role the context plays and, beside it, the producer the
 * durable source identifies, so a reader can tell an injected skill catalog
 * from a workspace instruction file or a recalled session without expanding.
 * The expanded body follows the producer-declared form; an absent or unknown
 * form renders the opaque body.
 * @param props - Durable content, its projected producer role/name and form, and the locale seat.
 * @returns A collapsed context row with a bounded, form-specific body.
 */
export function ContextInjectionRow({ content, source, provenance, producer, form, t }) {
    const [open, setOpen] = useState(false);
    // Two host generations, one component. A row whose projection is absent
    // entirely still renders: the marker falls back to a plain injection.
    const view = provenance ?? producer ?? { role: 'inject', label: null };
    // Resolved rather than declared: a form whose fields are unreadable renders
    // the opaque body, and the marker must say what the row actually shows.
    const { rendered, summary, body } = contextBody(form, { content, source, t });
    const tools = toolUpdateRows(content);
    const toolSummary = tools === null || tools.single !== null ? null
        : tools.added.length > 0 && tools.removed.length > 0
            ? t('message.toolsChanged', { added: tools.added.length, removed: tools.removed.length })
            : tools.added.length > 0
                ? t('message.toolsAddedCount', { count: tools.added.length })
                : t('message.toolsRemovedCount', { count: tools.removed.length });
    return (_jsx(DisclosureRow, { className: css.root, icon: view.role === 'recall' && tools === null
            ? _jsx("span", { "data-context-recall-icon": true, children: _jsx(ReferenceIcon, { kind: "session" }) })
            : _jsx(IconBrowseOutlineRegular, { size: 14 }), chevronClassName: css.chevron, title: tools?.single !== undefined && tools.single !== null
            ? t(tools.single.type === 'tool-addition' ? 'message.toolAdded' : 'message.toolRemoved', { name: tools.single.toolName })
            : tools !== null
                ? t('message.toolsUpdated')
                : t(view.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection'), collapsedContent: toolSummary !== null ? (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.summary, children: toolSummary })] })) : tools !== null || view.label === null ? undefined : (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.source, "data-context-source": true, children: view.label }), summary !== null && (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.summary, "data-context-summary": true, children: summary })] }))] })), keepContentWhenOpen: true, open: open && tools?.single == null, expandable: tools?.single == null, expandOnRowClick: true, onToggle: () => { setOpen(value => !value); }, children: _jsx("div", { className: css.body, "data-context-injection-body": true, "data-context-form": rendered ?? undefined, children: tools === null ? body : (_jsxs("div", { className: css.toolChanges, children: [tools.added.length > 0 && _jsx("div", { children: t('message.toolsAdded', { names: tools.added.join(', ') }) }), tools.removed.length > 0 && _jsx("div", { children: t('message.toolsRemoved', { names: tools.removed.join(', ') }) })] })) }) }));
}
//# sourceMappingURL=ContextInjectionRow.js.map