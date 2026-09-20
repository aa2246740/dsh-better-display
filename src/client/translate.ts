/**
 * The translated-label seat, with a built-in fallback dictionary.
 *
 * The host delivers a \`t\` function to a view only when it wires a locale seat
 * for that registration. 0.1.6 changed how that seat is delivered, and a view
 * that receives no seat used to crash on its first \`t('…')\` call — React then
 * unmounted the whole block boundary and the reader showed
 * "此内容暂时无法在阅读页显示". A missing label is not worth losing the record
 * over, so this resolves the seat defensively and falls back to the same copy
 * the plugin already ships in its own dictionary.
 *
 * The fallback is intentionally small and only covers the keys this plugin
 * actually asks for; an unknown key returns the key itself, which is visibly
 * wrong rather than silently empty.
 */

/** Copy for the keys this plugin reads. Mirrors the shipped chat dictionary. */
const FALLBACK: Record<string, string> = {
  'chat.deepDiving': '深度求索中...',
  'json.truncated': '已截断（共 {total} 字符）',
  'message.unknownBlock': '未知内容块',
  'message.contextInjection': '上下文注入',
  'message.contextRecall': '召回的记忆',
  'message.context.catalog.more': '另有 {count} 项',
  'message.context.catalog.replaced': '目录已更新',
  'message.context.recall.counts': '已召回 {count} 条',
  'message.context.recall.truncated': '部分内容已省略',
  'message.context.relay.from': '来自 {session}',
  'message.context.snapshot.supersedes': '已取代先前版本',
}

export type Translate = (key: string, params?: Record<string, unknown>) => string

function fill(template: string, params: Record<string, unknown> | undefined): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole)
}

/**
 * Resolve the host's translator, or a dictionary-backed stand-in.
 *
 * @param candidate - Whatever the slot delivered as \`props.t\`; may be absent.
 * @returns A function that always returns a string.
 */
export function translateOf(candidate: unknown): Translate {
  if (typeof candidate === 'function') {
    const host = candidate as Translate
    return key => {
      try {
        const value = host(key)
        // A host that answers with an empty string is telling us it has no
        // entry for this key; prefer our own copy over a blank label.
        return typeof value === 'string' && value !== '' ? value : (FALLBACK[key] ?? key)
      } catch {
        return FALLBACK[key] ?? key
      }
    }
  }
  return (key, params) => {
    const template = FALLBACK[key] ?? key
    return fill(template, params)
  }
}
