/** One developer tool-change block the 0.1.7-rc.2 context row names in place. */
export interface ToolChangeBlock {
    type: 'tool-addition' | 'tool-removal';
    toolName: string;
}
/** Names collected from a context whose every block is a tool change. */
export interface ToolUpdateRows {
    added: readonly string[];
    removed: readonly string[];
    /** The only block, when the row is a single add or removal. */
    single: ToolChangeBlock | null;
}
/**
 * Classify a context as the rc.2 tool-update row.
 * Mixed or empty content stays on the generic injection presentation.
 * @param content - durable context blocks.
 * @returns collected names, or null when any block is not a tool change.
 */
export declare function toolUpdateRows(content: readonly {
    readonly type: string;
    readonly toolName?: string;
}[]): ToolUpdateRows | null;
//# sourceMappingURL=tool-update.d.ts.map