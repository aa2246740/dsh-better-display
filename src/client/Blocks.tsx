import { Component, Fragment, memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AssistantBlock, UserMessageNode } from '@deepseek-ai/dsh-client-runtime/client';
import { JsonBlock, MessageText, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BlockRenderProps, ReaderBlockOwner } from './types.js';
import { useStreamingText } from './streaming.js';
import { MotionMarkdown, MotionPlainText } from './word-motion.js';
import css from './Reader.module.css';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

export class BlockBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className={css.notice}>此内容暂时无法在阅读页显示；原对话中的记录未受影响。</div> : this.props.children;
  }
}

export const ImageBlock = memo(function ImageBlock({ attachment, loadImage }: {
  attachment: ImageAttachmentRef; loadImage: BlockRenderProps['loadImage'];
}) {
  const [attempt, setAttempt] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [decoded, setDecoded] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let active = true;
    let owned: string | null = null;
    const timeout = setTimeout(() => { if (active) { setError(true); active = false; } }, 20000);
    setError(false); setDecoded(false); setUrl(null);
    void loadImage(attachment).then(result => {
      if (!active) return;
      clearTimeout(timeout);
      if (!IMAGE_TYPES.has(result.mediaType)) throw new Error('Unsupported image media type');
      const bytes = Uint8Array.from(result.data);
      owned = URL.createObjectURL(new Blob([bytes.buffer], { type: result.mediaType }));
      setUrl(owned);
    }).catch(() => { clearTimeout(timeout); if (active) setError(true); });
    return () => { active = false; clearTimeout(timeout); if (owned) URL.revokeObjectURL(owned); };
  }, [attachment.attachmentId, attempt, loadImage]);
  const width = Number.isFinite(attachment.width) && attachment.width > 0 ? attachment.width : 4;
  const height = Number.isFinite(attachment.height) && attachment.height > 0 ? attachment.height : 3;
  return <figure className={css.imageFigure} data-reader-image data-image-state={error ? 'error' : decoded ? 'ready' : 'loading'}>
    <div className={css.imageFrame} style={{ aspectRatio: `${width} / ${height}` }}>
      {!error && url && <button ref={opener} type="button" className={css.imageOpen} aria-label={`放大图片${attachment.name ? `：${attachment.name}` : ''}`} onClick={() => dialog.current?.showModal()}>
        <img src={url} alt={attachment.name ?? '会话图片'} width={width} height={height} onLoad={() => setDecoded(true)} onError={() => setError(true)} data-ready={decoded} />
      </button>}
      {(!decoded || error) && <div className={css.imagePlaceholder}>
        <span>{error ? '图片未能加载' : '正在加载图片'}</span>
        {error && <button type="button" className={css.textButton} onClick={() => setAttempt(value => value + 1)}>重试</button>}
      </div>}
    </div>
    {attachment.name && <figcaption>{attachment.name}</figcaption>}
    <dialog ref={dialog} className={css.imageDialog} aria-label="图片预览" onClose={() => opener.current?.focus()} onClick={event => { if (event.target === dialog.current) dialog.current?.close(); }}>
      <button type="button" autoFocus className={css.dialogClose} aria-label="关闭图片预览" onClick={() => dialog.current?.close()}>×</button>
      {url && <img src={url} alt={attachment.name ?? '会话图片'} />}
    </dialog>
  </figure>;
});

export function contentBlocks(content: UserMessageNode['content']): AssistantBlock[] {
  return content.map(block => {
    if (block.type === 'text') return { kind: 'text', text: block.text };
    if (block.type === 'image') return { kind: 'image', attachment: block.attachment };
    return { kind: 'other', block };
  });
}

type TextPresentation = { startedAt?: number; interrupted?: boolean; liveText?: boolean };

function ReadingMarkdown({ text, streaming, holdFormatting, startedAt, interrupted = false, liveText = false, kind = 'body' }: { text: string; streaming: boolean; holdFormatting: boolean; kind?: 'body' | 'reasoning' } & TextPresentation) {
  const root = useRef<HTMLDivElement>(null);
  const presentation = useStreamingText(text, streaming, { startedAt, interrupted: interrupted || !liveText, selected: holdFormatting });
  // Native Markdown changes block keys for its full final parse. Keep the last
  // committed mode while this answer is selected, then finish formatting on
  // deselection. Business status and the source text still update normally.
  const committedMode = useRef(streaming);
  const effectiveMode = holdFormatting ? committedMode.current : presentation.formatStreaming;
  useLayoutEffect(() => { committedMode.current = effectiveMode; }, [effectiveMode]);
  return <div ref={root} className={css.readingText} data-reader-text data-reader-text-kind={kind} data-received-length={text.length} data-shown-length={presentation.text.length}
    data-presentation-pending={presentation.pending || undefined} data-motion-style="opacity-blur" data-ud-motion="reader-text-arrival" data-ud-motion-type="reveal" data-ud-motion-no-flash="true">
    <MotionMarkdown text={presentation.text} streaming={effectiveMode} enabled={liveText && presentation.reveal && effectiveMode} revision={presentation.revision} />
  </div>;
}

function ReadingReasoning({ text, streaming, holdFormatting, startedAt, interrupted = false, liveText = false }: { text: string; streaming: boolean; holdFormatting: boolean } & TextPresentation) {
  const presentation = useStreamingText(text, streaming, { startedAt, interrupted: interrupted || !liveText, selected: holdFormatting });
  return <div className={css.readingText} data-reader-text data-reader-text-kind="reasoning" data-received-length={text.length} data-shown-length={presentation.text.length}
    data-presentation-pending={presentation.pending || undefined} data-motion-style="opacity-blur" data-ud-motion="reader-text-arrival" data-ud-motion-type="reveal" data-ud-motion-no-flash="true">
    <MotionPlainText text={presentation.text} enabled={liveText && presentation.reveal} revision={presentation.revision} />
  </div>;
}

function fallback(block: AssistantBlock, streaming: boolean, source: ReaderBlockOwner['source'], loadImage: BlockRenderProps['loadImage'], holdFormatting: boolean, presentation: TextPresentation): ReactNode {
  switch (block.kind) {
    case 'text': return source === 'user' ? <MessageText text={block.text} /> : <ReadingMarkdown text={block.text} streaming={streaming} holdFormatting={holdFormatting} {...presentation} />;
    case 'image': return <ImageBlock attachment={block.attachment} loadImage={loadImage} />;
    case 'reasoning': return <ReadingReasoning text={block.text} streaming={streaming} holdFormatting={holdFormatting} {...presentation} />;
    case 'tool-call': return <JsonBlock label={`工具参数 · ${block.name}`} payload={block.argsRaw} />;
    case 'other': return <div className={css.unknown}>
      <p>此内容类型尚未接入阅读页，原始内容已保留。</p>
      <JsonBlock label="查看原始内容" payload={block.block} />
    </div>;
  }
}

export const Blocks = memo(function Blocks({ blocks, streaming = false, source = 'assistant', holdFormatting = false, startedAt, interrupted, liveText, renderSlotChain, loadImage }: BlockRenderProps & TextPresentation & {
  blocks: readonly AssistantBlock[]; streaming?: boolean; source?: ReaderBlockOwner['source']; holdFormatting?: boolean;
}) {
  return <div className={css.blocks} data-streaming={streaming || undefined}>
    {blocks.map((block, index) => <BlockBoundary key={block.kind === 'image' ? `image:${block.attachment.attachmentId}:${index}` : `${index}:${block.kind}`}>
      <Fragment>{renderSlotChain('dsh-better-display.block', { block, streaming, source }, { fallback: fallback(block, streaming, source, loadImage, holdFormatting, { startedAt, interrupted, liveText }) })}</Fragment>
    </BlockBoundary>)}
  </div>;
});

export function CopyAnswer({ blocks }: { blocks: readonly AssistantBlock[] }) {
  const [receipt, setReceipt] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const text = blocks.filter((block): block is Extract<AssistantBlock, { kind: 'text' }> => block.kind === 'text').map(block => block.text).join('\n\n');
  if (!text.trim()) return null;
  return <div className={css.answerActions}>
    <button type="button" className={css.iconButton} aria-label="复制回答" title="复制回答" onClick={async () => {
      const accepted = await writeClipboard(text);
      setReceipt(accepted ? '已复制' : '未能复制，请手动选择文字');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setReceipt(''), 2000);
    }}>
      <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5" /><path d="M3 10H2.8A.8.8 0 0 1 2 9.2V2.8a.8.8 0 0 1 .8-.8h6.4a.8.8 0 0 1 .8.8V3" /></svg>
    </button>
    <span role="status" className={css.meta}>{receipt}</span>
  </div>;
}
