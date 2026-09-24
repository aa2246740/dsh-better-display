import { jsx as _jsx, Fragment as _Fragment, jsxs as _jsxs } from "react/jsx-runtime";
import { useState } from 'react';
import { DisclosureRow, IconBrowseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives';
import { ReferenceIcon } from './ReferenceIcon.js';
import { contextBody } from './ContextBody.js';
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
    return (_jsx(DisclosureRow, { className: css.root, icon: view.role === 'recall'
            ? _jsx("span", { "data-context-recall-icon": true, children: _jsx(ReferenceIcon, { kind: "session" }) })
            : _jsx(IconBrowseOutlineRegular, { size: 14 }), chevronClassName: css.chevron, title: t(view.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection'), collapsedContent: view.label === null ? undefined : (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.source, "data-context-source": true, children: view.label }), summary !== null && (_jsxs(_Fragment, { children: [_jsx("span", { className: css.sep, "aria-hidden": true }), _jsx("span", { className: css.summary, "data-context-summary": true, children: summary })] }))] })), keepContentWhenOpen: true, open: open, expandable: true, expandOnRowClick: true, onToggle: () => { setOpen(value => !value); }, children: _jsx("div", { className: css.body, "data-context-injection-body": true, "data-context-form": rendered ?? undefined, children: body }) }));
}
//# sourceMappingURL=ContextInjectionRow.js.map