import { useState } from 'react'
import type { ContextMessageNode } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
import { DisclosureRow, IconBrowseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { ReferenceIcon } from './ReferenceIcon.js'
import { contextBody } from './ContextBody.js'
import { toolUpdateRows } from './tool-update.js'
import css from './ContextInjectionRow.module.css'

/** Props for the logged non-user message presentation. */
export interface ContextInjectionRowProps {
  content: ContextMessageNode['content']
  source: ContextMessageNode['source']
  /**
   * Role and producer name projected from the durable source.
   *
   * Host generations disagree on the field name: newer builds project
   * `provenance`, the 0.1.6-alpha generations project `producer`. Both are
   * optional here and resolved below, so the row renders on either host instead
   * of throwing on `undefined.role` and degrading its whole block boundary.
   */
  provenance?: ContextMessageNode['producer'] | null
  /** Alpha-generation spelling of {@link provenance}. */
  producer?: ContextMessageNode['producer'] | null
  /** Producer-declared information form; null renders the opaque body. */
  form: ContextMessageNode['form']
  /** The owning view's locale seat, passed down as a plain prop. */
  t: TranslateNS<'chat'>
}

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
export function ContextInjectionRow({ content, source, provenance, producer, form, t }: ContextInjectionRowProps) {
  const [open, setOpen] = useState(false)
  // Two host generations, one component. A row whose projection is absent
  // entirely still renders: the marker falls back to a plain injection.
  const view = provenance ?? producer ?? { role: 'inject' as const, label: null }
  // Resolved rather than declared: a form whose fields are unreadable renders
  // the opaque body, and the marker must say what the row actually shows.
  const { rendered, summary, body } = contextBody(form, { content, source, t })
  const tools = toolUpdateRows(content)
  const toolSummary = tools === null || tools.single !== null ? null
    : tools.added.length > 0 && tools.removed.length > 0
      ? t('message.toolsChanged', { added: tools.added.length, removed: tools.removed.length })
      : tools.added.length > 0
        ? t('message.toolsAddedCount', { count: tools.added.length })
        : t('message.toolsRemovedCount', { count: tools.removed.length })

  return (
    <DisclosureRow
      className={css.root}
      icon={view.role === 'recall' && tools === null
        ? <span data-context-recall-icon><ReferenceIcon kind="session" /></span>
        : <IconBrowseOutlineRegular size={14} />}
      chevronClassName={css.chevron}
      title={tools?.single !== undefined && tools.single !== null
        ? t(tools.single.type === 'tool-addition' ? 'message.toolAdded' : 'message.toolRemoved', { name: tools.single.toolName })
        : tools !== null
          ? t('message.toolsUpdated')
          : t(view.role === 'recall' ? 'message.contextRecall' : 'message.contextInjection')}
      collapsedContent={toolSummary !== null ? (
        <>
          <span className={css.sep} aria-hidden />
          <span className={css.summary}>{toolSummary}</span>
        </>
      ) : tools !== null || view.label === null ? undefined : (
        /* ToolRow's separator shape: an aria-hidden dot, so the accessible name
           stays the two readable parts and the two disclosure rows expose one
           name shape. A source that names no producer drops the dot with it. */
        <>
          <span className={css.sep} aria-hidden />
          <span className={css.source} data-context-source>{view.label}</span>
          {summary !== null && (
            <>
              <span className={css.sep} aria-hidden />
              <span className={css.summary} data-context-summary>{summary}</span>
            </>
          )}
        </>
      )}
      keepContentWhenOpen
      open={open && tools?.single == null}
      expandable={tools?.single == null}
      expandOnRowClick
      onToggle={() => { setOpen(value => !value) }}
    >
      <div className={css.body} data-context-injection-body data-context-form={rendered ?? undefined}>
        {tools === null ? body : (
          <div className={css.toolChanges}>
            {tools.added.length > 0 && <div>{t('message.toolsAdded', { names: tools.added.join(', ') })}</div>}
            {tools.removed.length > 0 && <div>{t('message.toolsRemoved', { names: tools.removed.join(', ') })}</div>}
          </div>
        )}
      </div>
    </DisclosureRow>
  )
}
