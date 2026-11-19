/**
 * Untrusted assistant-Markdown renderer over the direct mdast pipeline:
 * `parse.ts` grammars, the incremental streaming parser, and `render.tsx`.
 * While a message streams, all but the trailing two blocks freeze as cached
 * React elements and only the source tail behind them re-parses per chunk,
 * so per-chunk work tracks the tail size instead of the whole reply. Frozen
 * blocks keep their source-offset keys when they cross the freeze boundary,
 * so React reconciles instead of remounting. Known deviation while
 * streaming: a reference-style link or footnote whose definition sits on the
 * other side of the freeze boundary renders literally until the settled
 * full parse self-heals it.
 */
import type { MarkdownPathImages } from '@deepseek-ai/dsh-client-ui-primitives';
import type { MarkdownCodeLabels, MarkdownFileMentions, MarkdownRenderContext } from './render.js';
export type { MarkdownCodeLabels, MarkdownFileMentions } from './render.js';
/**
 * Render untrusted assistant-authored Markdown as semantic React elements.
 * @param props - Markdown source text preserved by the session projection;
 * `streaming` renders fences and TeX plain (highlighting and KaTeX land on
 * the finalize swap) and parses incrementally across chunks; `codeLabels`
 * forwards localized copy-button labels to fence CodeBlocks — pass a
 * reference-stable object (memoized per locale revision), because a new
 * identity discards the streaming render cache mid-message. `fileMentions`
 * links inline-code tokens its resolver recognizes as real files; this is
 * the single streaming gate — it applies to settled renders only, because a
 * streaming message's vocabulary is not final and frozen cached elements
 * must not bake in handlers that could go stale.
 * @returns A GFM document with TeX math rendered through KaTeX; raw HTML,
 * relative links, and unsafe protocols are disabled, while absolute HTTP(S)
 * images render directly.
 */
export declare const MarkdownText: import("react").MemoExoticComponent<({ text, streaming, codeLabels, fileMentions, pathImages, renderText, renderAtom, openFile }: {
    text: string;
    streaming?: boolean;
    codeLabels?: MarkdownCodeLabels | undefined;
    fileMentions?: MarkdownFileMentions | undefined;
    pathImages?: MarkdownPathImages | undefined;
    renderText?: MarkdownRenderContext["renderText"];
    renderAtom?: MarkdownRenderContext["renderAtom"];
    /**
     * Opens a file chip's target.
     *
     * The Host scopes this with `MarkdownDelegateProvider` and its own chip reads it from
     * there; this renderer is a plain function, so the owner threads the same opener in.
     * It is the route that reaches the right-hand preview panel.
     */
    openFile?: MarkdownRenderContext["openFile"];
}) => import("react").JSX.Element>;
//# sourceMappingURL=MarkdownText.d.ts.map