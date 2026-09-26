/** One developer tool-change block the 0.1.7-rc.2 context row names in place. */
export interface ToolChangeBlock {
  type: 'tool-addition' | 'tool-removal'
  toolName: string
}

/** Names collected from a context whose every block is a tool change. */
export interface ToolUpdateRows {
  added: readonly string[]
  removed: readonly string[]
  /** The only block, when the row is a single add or removal. */
  single: ToolChangeBlock | null
}

/**
 * Classify a context as the rc.2 tool-update row.
 * Mixed or empty content stays on the generic injection presentation.
 * @param content - durable context blocks.
 * @returns collected names, or null when any block is not a tool change.
 */
export function toolUpdateRows(content: readonly { readonly type: string; readonly toolName?: string }[]): ToolUpdateRows | null {
  if (content.length === 0) return null
  const rows: ToolChangeBlock[] = []
  for (const block of content) {
    if (block.type !== 'tool-addition' && block.type !== 'tool-removal') return null
    if (typeof block.toolName !== 'string') return null
    rows.push({ type: block.type, toolName: block.toolName })
  }
  const added = rows.flatMap(row => row.type === 'tool-addition' ? [row.toolName] : [])
  const removed = rows.flatMap(row => row.type === 'tool-removal' ? [row.toolName] : [])
  return { added, removed, single: rows.length === 1 ? rows[0]! : null }
}
