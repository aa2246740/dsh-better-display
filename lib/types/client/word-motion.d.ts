import type { MarkdownFileMentions } from '@deepseek-ai/dsh-client-ui-primitives';
/** Native Think is literal text, not Markdown. Spans never alter its bytes. */
export declare function MotionPlainText({ text, enabled, revision }: {
    text: string;
    enabled: boolean;
    revision: number;
}): import("react").JSX.Element;
/** Native DSH Markdown semantics with a stable text-leaf animation hook. */
export declare function MotionMarkdown({ text, streaming, enabled, revision, fileMentions, cwd }: {
    text: string;
    streaming: boolean;
    enabled: boolean;
    revision: number;
    fileMentions?: MarkdownFileMentions;
    /** Session workspace, so a relative image destination resolves to a real file. */
    cwd?: string;
}): import("react").JSX.Element;
//# sourceMappingURL=word-motion.d.ts.map