import type {} from '@deepseek-ai/dsh-session-turn-outline/types';
import { Fragment, memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ChatConversationViewNode, ChatNode, ChatNodeKind } from '@deepseek-ai/dsh-client-ui-chat/client';
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { BlockBoundary, Blocks, contentBlocks, CopyAnswer, UserMessageActions } from './Blocks.js';
import { ReasoningCard } from './ReasoningCard.js';
import { ToolActivity, ToolMedia } from './ToolActivity.js';
import { OfficialActions, OfficialNode, OfficialTail } from './OfficialContent.js';
import { preparingLabel, readerFlow } from './tool-activity.js';
import { Disclosure, ProcessFragment, RetiringContent, StatusText, useMotionAllowed, usePinnedSelection, useReadingScroll } from './motion.js';
import { StreamMotionContext } from './streaming.js';
import { assistantSegments, boundaryOf, forkAnchorSeq, groupNodes, hasProcessContent, hasVisibleBody, isEarlierNarration, processChoiceKey, processExpanded, terminalLabel, toggleProcessOpen } from './projection.js';
import { basename, createProducedFileMentions, dirname, getTurnDeliverables, showDeliverablesRow } from './deliverables.js';
import { deliverableOpenModeOf, type DeliverableOpenMode } from './open-file.js';
import { asReadonlyArray, pendingSubmissionImages, type PendingSubmissionEcho } from './pending-submission.js';
import { WaitingStatus } from './WaitingStatus.js';
import { handsBackToModel, waitingAnchor } from './waiting-clock.js';
import { ContextInjectionRow } from './native/ContextInjectionRow.js';
import { TimelineRail } from './TimelineRail.js';
import { landTurn, scrollerOf } from './conversation-scroll.js';
import { mergeTimelineItems, type TimelineItem } from './timeline.js';
import { presentLiveTurn, segmentLiveTurn, settledFoldItems } from './live-turn.js';
import type { LiveStep } from './live-turn.js';
import { foldIntensityOf, frostedGlassOf, keepProseOf, keepToolSemanticsOf, type FoldIntensity } from './fold-intensity.js';
import { ChoreographedFlow, useFlowChat } from './ChoreographedFlow.js';
import { ClosedProcessSummary } from './ClosedProcessSummary.js';
import { StickyLane } from './StickyLane.js';
import type { ReaderGroup, TurnBoundary } from './projection.js';
import type { BlockRenderProps, ReaderProps } from './types.js';
import css from './Reader.module.css';
import { markdownLabels, truncatedJsonLabel } from './primitive-labels.js';

function isNode<K extends ChatNodeKind>(node: ChatConversationViewNode, kind: K): node is ChatNode<K> {
  return node.kind === kind;
}

function cleanErrorMessage(raw: string | undefined): string {
  if (!raw) return '模型服务暂时无响应或连接中断，请稍后重试。';
  let str = raw.trim();
  if (str.includes('"error"') || str.startsWith('{')) {
    try {
      const idx = str.indexOf('{');
      const parsed = JSON.parse(str.slice(idx));
      const msg = parsed?.error?.message || parsed?.message || parsed?.error;
      if (typeof msg === 'string') str = msg;
    } catch {
      // keep
    }
  }
  return str;
}

type SeatProps = BlockRenderProps & Pick<ReaderProps, 'useChat'> & {
  nodeKey: string; boundary: TurnBoundary; pinned?: boolean; processOpen?: boolean;
};

const CompactionDivider = memo(function CompactionDivider({ data }: {
  data: { summary?: string | null; shadowedItemCount?: number | null; shadowedTokenCount?: number | null } | null;
}) {
  const [open, setOpen] = useState(false);
  if (!data) return null;

  const hasSummary = typeof data.summary === 'string' && data.summary.trim().length > 0;
  const items = data.shadowedItemCount;
  const tokens = data.shadowedTokenCount;

  let label = '已压缩历史上下文';
  if (items && tokens) {
    const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
    label = `已压缩 ${items} 条上下文 · 释放约 ${kTokens} tokens`;
  } else if (items) {
    label = `已压缩 ${items} 条上下文`;
  } else if (tokens) {
    const kTokens = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens);
    label = `已压缩上下文 · 释放约 ${kTokens} tokens`;
  }

  return (
    <div className={css.compactionRow} data-reader-compaction>
      <div className={css.compactionLine}>
        {hasSummary ? (
          <button
            type="button"
            className={`${css.compactionPill} ${css.compactionButton}`}
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            title={open ? '收起历史记忆摘要' : '展开查看此节点提炼的记忆摘要'}
          >
            <svg className={css.compactionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" strokeWidth="1.2" />
              <path d="M8 5v3.2l2 1.8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{label}</span>
            <span className={css.compactionToggle}>{open ? '收起备忘' : '查看备忘'}</span>
          </button>
        ) : (
          <span className={css.compactionPill}>
            <svg className={css.compactionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2z" strokeWidth="1.2" />
              <path d="M8 5v3.2l2 1.8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{label}</span>
          </span>
        )}
      </div>
      {open && hasSummary && (
        <div className={css.compactionSummaryBox} data-reader-anchor>
          <div className={css.compactionSummaryHeader}>前期对话要点备忘</div>
          <MarkdownText text={data.summary!} labels={markdownLabels} />
        </div>
      )}
    </div>
  );
});

const ProcessNode = memo(function ProcessNode({ useChat, t, nodeKey, open, motion, onRead, returnFocusTo }: Pick<ReaderProps, 'useChat' | 't'> & {
  nodeKey: string; open: boolean; motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>;
}) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden') return null;
  let content: ReactNode = null;
  if (isNode(node, 'context')) content = <ContextInjectionRow {...node.data} t={t} />;
  else if (isNode(node, 'system-prompt')) content = <details className={css.detail}><summary>系统提示词</summary><pre className={css.systemPrompt}>{node.data.text}</pre></details>;
  else if (isNode(node, 'model-retry')) content = <JsonBlock label="模型重试记录" payload={node.data.attempts} truncatedLabel={truncatedJsonLabel} />;
  else if (isNode(node, 'manual-compaction')) {
    if (node.data.command.outcome?.kind === 'error') {
      content = <div className={css.error} role="alert">
        <svg className={css.errorIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
          <circle cx="8" cy="8" r="6.5" strokeWidth="1.2" />
          <path d="M8 5v3.5M8 11.2h.01" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <div className={css.errorCopy}>
          <div className={css.errorTitle}><strong>上下文压缩未成功</strong></div>
          <p className={css.errorMessage}>{node.data.command.outcome.text}</p>
        </div>
      </div>;
    } else {
      content = node.data.compaction ? <CompactionDivider data={node.data.compaction} /> : null;
    }
  }
  else if (isNode(node, 'compaction')) content = <CompactionDivider data={node.data} />;
  else if (isNode(node, 'command')) content = <JsonBlock label="命令记录" payload={node.data} truncatedLabel={truncatedJsonLabel} />;
  return content && <ProcessFragment open={open} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey} framed>{content}</ProcessFragment>;
});

const AssistantNode = memo(function AssistantNode({ useChat, nodeKey, boundary, processOpen = false, pinned = false, folded = false, partStart, motion, onRead, returnFocusTo, ...render }: SeatProps & {
  motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>; partStart?: number; folded?: boolean;
}) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden' || !isNode(node, 'assistant-step')) return null;
  const data = node.data;
  const parts = assistantSegments(data.blocks);
  const earlier = isEarlierNarration(data, boundary);
  const hasToolCalls = data.blocks.some(block => block.kind === 'tool-call');
  const isProcessStep = earlier || folded || hasToolCalls || (boundary.latestStep > 0 && data.step < boundary.latestStep);
  const body = data.blocks.filter(block => block.kind !== 'reasoning' && block.kind !== 'tool-call');
  const visible = partStart === undefined ? parts : parts.filter(part => part.start === partStart);
  return <>{visible.map(part => {
    const index = parts.findIndex(item => item.start === part.start);
    const last = index === parts.length - 1;
    return part.kind === 'reasoning'
    ? <ProcessFragment key={part.start} open={processOpen} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey} framed>
      <ReasoningCard step={data.step} active={processOpen && boundary.status === 'open' && data.step === boundary.latestStep} motion={motion} selected={pinned} onRead={onRead}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running' && last && data.blocks.at(-1)?.kind === 'reasoning'}
          holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
      </ReasoningCard>
    </ProcessFragment>
    : isProcessStep ? <ProcessFragment key={part.start} open={processOpen} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey}>
      <article className={css.processCommentary}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running'} holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
      </article>
    </ProcessFragment>
    : hasVisibleBody(part.blocks) && <RetiringContent key={part.start} visible={pinned || processOpen || (!earlier && !folded)}>
      <article className={css.answer} data-reader-answer data-reader-anchor data-reader-key={nodeKey} data-reader-source-start={part.start} data-answer-status={data.status} data-answer-phase={earlier || folded ? 'process' : 'body'}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running'} holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
        {last && data.status === 'interrupted' && <span className={css.stopped}>已停止</span>}
        {last && !earlier && !folded && data.status !== 'running' && boundary.status === 'closed' && (
          <CopyAnswer blocks={body} onFork={(() => {
            // The fork anchor must be the durable closing message seq (same as
            // the official turn-tail branch). AssistantChatData carries no seq
            // of its own; passing it would fork the whole session instead.
            const anchor = forkAnchorSeq([data.finalNode, { seq: render.forkSeq }]);
            return render.forkAt && anchor !== undefined ? () => render.forkAt!(anchor) : undefined;
          })()} metrics={render.metrics} extraActions={<OfficialActions official={render.official} messageId={data.finalNode?.messageId} />} />
        )}
      </article>
    </RetiringContent>;
  })}</>;
});

const MainNode = memo(function MainNode({ useChat, nodeKey, boundary, pinned, processOpen = false, ...render }: SeatProps) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden') return null;
  if (isNode(node, 'user') || isNode(node, 'steering')) {
    const blocks = contentBlocks(node.data.content);
    const imageBlocks = blocks.filter(b => b.kind === 'image');
    const otherBlocks = blocks.filter(b => b.kind !== 'image');
    const text = otherBlocks.filter((block): block is Extract<typeof block, { kind: 'text' }> => block.kind === 'text').map(block => block.text).join('\n\n');
    const time = node.data.time;
    return <div className={css.userCluster} data-reader-anchor data-reader-key={nodeKey}>
      {node.kind === 'steering' && <p className={css.meta}>补充消息</p>}
      {imageBlocks.length > 0 && <div className={css.userImages}>
        <Blocks {...render} blocks={imageBlocks} source="user" />
      </div>}
      {otherBlocks.length > 0 && <div className={css.user}>
        <Blocks {...render} blocks={otherBlocks} source="user" />
      </div>}
      <UserMessageActions text={text} time={time} />
    </div>;
  }
  if (isNode(node, 'assistant-step')) return null;
  if (isNode(node, 'tool-call')) return <ToolMedia {...render} block={node.data.root} />;
  if (isNode(node, 'turn-error')) return <div className={css.error} role="alert" data-reader-anchor>
    <svg className={css.errorIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
      <circle cx="8" cy="8" r="6.5" strokeWidth="1.2" />
      <path d="M8 5v3.5M8 11.2h.01" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <div className={css.errorCopy}>
      <div className={css.errorTitle}>
        <strong>本轮运行失败</strong>
        {node.data.code && <code className={css.errorCode}>{node.data.code}</code>}
      </div>
      <p className={css.errorMessage}>{cleanErrorMessage(node.data.message)}</p>
    </div>
  </div>;
  if (isNode(node, 'turn-max-tokens')) return <div className={css.notice}>已到达输出长度限制，回答尚未完整。</div>;
  if (isNode(node, 'model-retry')) return node.data.current.retryState === 'scheduled'
    ? <div className={css.notice} role="status">模型请求未成功，正在等待重试。详情保留在执行过程中。</div> : null;
  if (isNode(node, 'command') && render.official) return <OfficialNode {...render} node={node} fallback={<JsonBlock label="命令记录" payload={node.data} truncatedLabel={truncatedJsonLabel} />} />;
  if (isNode(node, 'command')) {
    if (node.data.outcome?.kind === 'error') return <div className={css.error} role="alert">
      <svg className={css.errorIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
        <circle cx="8" cy="8" r="6.5" strokeWidth="1.2" />
        <path d="M8 5v3.5M8 11.2h.01" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className={css.errorCopy}>
        <div className={css.errorTitle}><strong>命令执行未成功</strong></div>
        <p className={css.errorMessage}>{node.data.outcome.text ?? node.data.name ?? '查看原对话中的命令记录'}</p>
      </div>
    </div>;
    return node.data.outcome?.text ? <MarkdownText text={node.data.outcome.text} labels={markdownLabels} /> : null;
  }
  if (isNode(node, 'manual-compaction') || isNode(node, 'compaction')) return null;
  if (node.kind === 'context' || node.kind === 'turn-tail' || node.kind === 'system-prompt' || node.kind === 'turn-process') return null;
  // No 'command-input' branch: that string is not a chat node kind in any released
  // host (it appears nowhere in the installed packages), so a slash command arrives
  // as 'command' above and is rendered there. Keeping the branch only made the file
  // look like it handled a case that cannot occur.
  return <OfficialNode {...render} node={node} fallback={<div className={css.unknown} data-reader-anchor>
    <p>此记录类型暂未接入阅读页：{node.kind}</p>
    {render.official && <button type="button" className={css.textButton} onClick={() => render.official!.openView('chat', node.key)}>在对话中查看</button>}
    <JsonBlock label="查看原始记录" payload={node.data} truncatedLabel={truncatedJsonLabel} />
  </div>} />;
});

/**
 * Sub-agents this turn dispatched, read from the host's own Turn-process row.
 *
 * The host already derives this from the dispatch tree (`subagentCount` on
 * `TurnProcessChatData`), so counting calls here would only risk disagreeing with
 * it. The row is otherwise hidden by the reader, which is why this is the one place
 * its counters are read.
 */
function subagentCount(snapshot: { nodes: { get(key: string): ChatConversationViewNode | undefined } }, keys: readonly string[]): number {
  for (const key of keys) {
    const node = snapshot.nodes.get(key);
    if (!node || node.kind !== 'turn-process') continue;
    const value = (node.data as { subagentCount?: unknown }).subagentCount;
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  }
  return 0;
}

function GroupStatus({ group, sessionId, useChat, useSessionPendingInteraction, motion }: Pick<ReaderProps, 'sessionId' | 'useChat' | 'useSessionPendingInteraction'> & { group: ReaderGroup; motion: boolean }) {
  const pending = useSessionPendingInteraction(snapshot => snapshot.get(sessionId));
  const text = useChat(snapshot => {
    const turn = group.turn === null ? undefined : snapshot.timeline.turns.get(group.turn);
    if (turn?.status === 'closed') {
      if (turn.end?.data.reason.kind !== 'completed') return '执行过程';
      const elapsed = turn.start && turn.end ? Math.max(0, Math.round((turn.end.time - turn.start.time) / 1000)) : null;
      return elapsed === null ? '执行过程' : elapsed < 60 ? `用时 ${elapsed} 秒` : `用时 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
    }
    if (turn?.status !== 'open') return '执行过程';
    if (pending !== undefined) return '等待你的操作';
    const current = turn.steps.at(-1)?.data.get('assistant-step');
    const last = current?.blocks.at(-1);
    if (current?.status === 'running' && last?.kind === 'tool-call') {
      const spawned = subagentCount(snapshot, group.keys);
      return spawned ? `${preparingLabel(last.name)}·${spawned} 个子代理` : preparingLabel(last.name);
    }
    for (let index = group.keys.length - 1; index >= 0; index--) {
      const node = snapshot.nodes.get(group.keys[index]);
      if (!node) continue;
      if (isNode(node, 'tool-call') && !('kind' in node.data.root)) return '正在使用工具';
      if (isNode(node, 'assistant-step') && node.data.status === 'running') {
        const last = node.data.blocks.at(-1);
        return last?.kind === 'reasoning' ? '正在思考' : last?.kind === 'text' ? '正在输出' : '正在准备回复';
      }
    }
    return '正在处理';
  });
  const busy = useChat(snapshot => group.turn !== null && snapshot.timeline.turns.get(group.turn)?.status === 'open' && pending === undefined);
  return <StatusText text={text} motion={motion} shimmer={busy} />;
}

const DeliverableChip = memo(function DeliverableChip({ path, openFile, revealFile, openMode }: {
  path: string;
  openFile?: (path: string) => Promise<void> | void;
  revealFile?: (path: string) => Promise<void> | void;
  openMode: DeliverableOpenMode;
}) {
  const [status, setStatus] = useState<'idle' | 'opened' | 'copied' | 'revealed'>('idle');
  const timer = useRef<ReturnType<typeof setTimeout>>();

  const flash = (next: 'opened' | 'copied' | 'revealed') => {
    setStatus(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus('idle'), 1600);
  };

  const onOpen = (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      openFile?.(path);
      flash('opened');
    } catch {
      // fallback
    }
  };

  const onReveal = (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      if (revealFile) {
        revealFile(path);
      } else {
        openFile?.(dirname(path));
      }
      flash('revealed');
    } catch {
      // fallback
    }
  };

  const onCopy = (event: React.MouseEvent) => {
    event.stopPropagation();
    try {
      void navigator.clipboard?.writeText(path);
      flash('copied');
    } catch {
      // fallback
    }
  };

  const name = basename(path);
  const folder = dirname(path);

  return (
    <div className={css.deliverableChip} data-status={status} title={path}>
      <button
        type="button"
        className={css.chipMain}
        onClick={onOpen}
        onDoubleClick={onOpen}
        aria-label={openMode === 'sidebar' ? `在内置面板中打开 ${path}` : `用系统应用打开 ${path}`}
      >
        {status === 'opened' ? (
          <svg className={css.statusIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M3.5 8.5l3 3 6-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg className={css.deliverableIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
            <path d="M4 2.5h5l3 3V13.5H4V2.5z" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M9 2.5v3h3" strokeWidth="1.2" strokeLinejoin="round" />
          </svg>
        )}
        <span className={css.deliverableName}>
          {status === 'opened' ? (openMode === 'sidebar' ? '已在面板打开' : '已在外部打开') : name}
        </span>
      </button>

      <div className={css.chipActions} aria-label="文件操作">
        <button
          type="button"
          className={css.chipActionBtn}
          title={`在访达中定位所在目录 (${folder})`}
          aria-label="在访达中显示所在目录"
          onClick={onReveal}
        >
          {status === 'revealed' ? (
            <svg className={css.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3.5 8.5l3 3 6-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className={css.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M2 4.5h4l1.5 2H14v6.5H2V4.5z" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
          )}
        </button>
        <button
          type="button"
          className={css.chipActionBtn}
          title="复制相对路径"
          aria-label="复制相对路径"
          onClick={onCopy}
        >
          {status === 'copied' ? (
            <svg className={css.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <path d="M3.5 8.5l3 3 6-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg className={css.actionIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
              <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" strokeWidth="1.2" />
              <path d="M4 10.5H3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
});

function DeliverablesRow({ deliverables, openFile, revealFile, openMode }: {
  deliverables: readonly string[];
  openFile?: (path: string) => Promise<void> | void;
  revealFile?: (path: string) => Promise<void> | void;
  openMode: DeliverableOpenMode;
}) {
  const [folderStatus, setFolderStatus] = useState<'idle' | 'opened'>('idle');
  const onOpenWorkspace = () => {
    try {
      openFile?.('.');
      setFolderStatus('opened');
      setTimeout(() => setFolderStatus('idle'), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <div className={css.deliverablesRoot} data-reader-deliverables>
      <span className={css.deliverablesLabel}>产物</span>
      <div className={css.deliverablesLane}>
        <div className={css.deliverablesRow}>
          {deliverables.slice(0, 8).map(path => (
            <DeliverableChip key={path} path={path} openFile={openFile} revealFile={revealFile} openMode={openMode} />
          ))}
          {deliverables.length > 8 && (
            <span className={css.deliverablesMore}>
              + {deliverables.length - 8} 个文件
            </span>
          )}
          {deliverables.length > 1 && (
            <button
              type="button"
              className={css.deliverablesShowFolder}
              data-status={folderStatus}
              onClick={onOpenWorkspace}
              title="在访达中打开整个工作区目录"
            >
              {folderStatus === 'opened' && (
                <svg className={css.statusIcon} viewBox="0 0 16 16" fill="none" stroke="currentColor">
                  <path d="M3.5 8.5l3 3 6-7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
              <span>{folderStatus === 'opened' ? '已打开访达' : '在文件夹中显示'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const TurnGroup = memo(function TurnGroup({ group, motion, autoFold, keepProse, keepToolSemantics, foldLevel, pinnedKeys, selectedProcessKeys, isAwaitingModel = false, ...props }: ReaderProps & { group: ReaderGroup; motion: boolean; autoFold: boolean; keepProse: boolean; keepToolSemantics: boolean; foldLevel: FoldIntensity; pinnedKeys: readonly string[]; selectedProcessKeys: readonly string[]; isAwaitingModel?: boolean }) {
  const snapshot = props.useChat(snapshot => snapshot);
  const nodes = snapshot.nodes;
  const turn = group.turn === null ? undefined : snapshot.timeline.turns.get(group.turn);
  const interaction = props.useSession(pendingInteractionOf);
  const sessionRunning = props.useSession(snapshot => snapshot.running);
  const boundary = useMemo(() => boundaryOf(turn), [turn]);
  const choiceKey = processChoiceKey(group.key, boundary);
  const expansionChoice = props.useStore(state => state.expanded[choiceKey]);
  const flowId = useId();
  const processButton = useRef<HTMLButtonElement>(null);
  const setExpanded = useCallback((value: boolean) => props.actions.setExpanded(choiceKey, value), [props.actions, choiceKey]);
  const pinProcess = useCallback(() => setExpanded(true), [setExpanded]);
  const firstKind = props.useChat(snapshot => snapshot.nodes.get(group.keys[0])?.kind);
  const startsWithUser = firstKind === 'user';
  const mainKeys = startsWithUser ? group.keys.slice(1) : group.keys;
  const flow = useMemo(() => readerFlow({ ...group, keys: mainKeys }, turn, key => nodes.get(key)), [nodes, group, mainKeys, turn]);
  const steps = useMemo(() => segmentLiveTurn(flow, key => nodes.get(key)), [flow, nodes]);
  // Level 2 ("summary") means "fold the process, never the prose"; the separate
  // switch extends that same guarantee to levels 0 and 1.
  const keepBody = keepProse || foldLevel === 2;
  const liveItems = useMemo(
    () => presentLiveTurn(steps, boundary, autoFold, keepBody, keepToolSemantics),
    [steps, boundary, autoFold, keepBody, keepToolSemantics],
  );
  // A finished turn used to fall back to one whole-turn disclosure, so the fold
  // switches silently stopped applying the moment a turn completed.
  const settled = useMemo(
    () => settledFoldItems(steps, boundary, autoFold && keepBody, keepToolSemantics),
    [steps, boundary, autoFold, keepBody, keepToolSemantics],
  );
  const openMode = deliverableOpenModeOf(useSyncExternalStore(
    props.openPrefs?.subscribe ?? ((fn: () => void) => { void fn; return () => {}; }),
    () => props.openPrefs?.getSnapshot()?.deliverableOpenMode,
    () => 'external',
  ));
  const hasProcess = flow.some(item => item.kind === 'tool' || hasProcessContent(nodes.get(item.nodeKey), boundary));
  // Only a real, still-active text selection delays folding. Merely clicking,
  // focusing or scrolling the live card does not create a permanent override.
  const holdingSelection = selectedProcessKeys.some(key =>
    flow.some(item => item.key === key)
    || liveItems.some(item => item.kind === 'fold'
      ? item.key === key || item.steps.some(step => step.key === key || ('nodeKey' in step && step.nodeKey === key))
      : item.key === key || ('nodeKey' in item.step && item.step.nodeKey === key)));
  const expanded = !autoFold || holdingSelection || processExpanded(expansionChoice, boundary);
  const [foldOpenByKey, setFoldOpenByKey] = useState<Record<string, boolean>>({});
  useLayoutEffect(() => {
    // Restoring automatic folding also releases live "prior steps" disclosures.
    if (autoFold) setFoldOpenByKey(current => Object.keys(current).length ? {} : current);
  }, [autoFold]);
  const deliverables = useMemo(() => getTurnDeliverables(turn, flow), [turn, flow]);
  const tailData = useMemo(() => {
    for (const key of group.keys) {
      const n = nodes.get(key);
      if (n && isNode(n, 'turn-tail')) return n.data;
    }
    return undefined;
  }, [group.keys, nodes]);
  const tailOwner = useMemo(() => turn && tailData ? {
    turn, seq: tailData.closing?.finalNode.seq ?? tailData.seq, openFile: props.openFile,
  } : undefined, [turn, tailData, props.openFile]);
  const fileMentions = useMemo(() => {
    const official = tailOwner ? props.officialFileMentions(tailOwner) : undefined;
    const reader = deliverables.length > 0 ? createProducedFileMentions(deliverables, props.openFile) : undefined;
    return official || reader ? { resolve: (value: string) => official?.resolve(value) ?? reader?.resolve(value) } : undefined;
  }, [tailOwner, props.officialFileMentions, deliverables, props.openFile]);
  const official = useMemo(() => ({
    renderSlot: props.renderSlot, renderSlotChain: props.renderSlotChain,
    officialImageLoader: props.officialImageLoader, officialFileMentions: props.officialFileMentions,
    officialPreviewFile: props.officialPreviewFile,
    officialHost: props.officialHost, openView: props.openView,
  }), [props.renderSlot, props.renderSlotChain, props.officialImageLoader, props.officialFileMentions, props.officialPreviewFile, props.officialHost, props.openView]);
  const cwd = props.useSessions(state => state.byId[props.sessionId]?.cwd);
  const runMs = turn?.start && turn?.end ? Math.max(0, turn.end.time - turn.start.time) : undefined;
  const metrics = useMemo(() => ({
    usage: tailData?.tokenUsage,
    runMs,
    tokensPerSecond: tailData?.tokensPerSecond,
    ttftMs: tailData?.ttftMs,
    endedAt: tailData?.closing?.time ?? turn?.end?.time,
  }), [tailData, runMs, turn?.end?.time]);
  const forkSeq = forkAnchorSeq([tailData?.closing?.finalNode]);
  const presentation = useMemo(() => {
    // ChatNodeStore exposes live keyed readers. Materialize this turn instead of
    // retaining a live get() function and mistakenly calling it a frozen frame.
    const captured = new Map(group.keys.flatMap(key => {
      const node = nodes.get(key); return node ? [[key, node] as const] : [];
    }));
    return { items: settled ?? (holdingSelection ? presentLiveTurn(steps, boundary, false) : liveItems),
      snapshot: { ...snapshot, nodes: { ...nodes, get: (key: string) => captured.get(key), values: () => [...captured.values()] } } };
  }, [snapshot, nodes, group, steps, boundary, liveItems, settled, holdingSelection]);
  const shared = {
    useChat: useFlowChat,
    renderSlotChain: props.renderSlotChain,
    loadImage: props.loadImage,
    fillComposer: props.fillComposer,
    openFile: props.openFile,
    revealFile: props.revealFile,
    forkAt: props.forkAt,
    forkSeq,
    fileMentions,
    metrics,
    official,
    cwd,
  };
  const terminal = terminalLabel(boundary.reason);
  const hasTurnError = flow.some(item => item.kind === 'node' && nodes.get(item.nodeKey)?.kind === 'turn-error');
  // A stopped turn normally stays quiet, but a stopped turn that produced no
  // prose at all reads as if its answer vanished into the process fold. Say so.
  const hasAnswerProse = steps.some(step => step.kind === 'body'
    && step.blocks.some(block => block.kind === 'text' && block.text.trim() !== ''));
  const stoppedWithoutAnswer = (boundary.reason === 'interrupted' || boundary.reason === 'aborted') && !hasAnswerProse;
  const showTerminalNotice = terminal && !hasTurnError
    && (stoppedWithoutAnswer || (boundary.reason !== 'interrupted' && boundary.reason !== 'aborted'));
  const renderStep = (step: LiveStep, folded: boolean) => {
    const processOpen = folded || expanded;
    if (step.kind === 'reasoning' || step.kind === 'body') return <BlockBoundary>
      <AssistantNode {...shared} boundary={boundary} nodeKey={step.nodeKey} partStart={step.start} pinned={pinnedKeys.includes(step.nodeKey)} processOpen={processOpen} folded={folded} motion={motion} onRead={pinProcess} returnFocusTo={processButton} />
    </BlockBoundary>;
    if (step.kind === 'tool') return <BlockBoundary><ProcessFragment open={processOpen} motion={motion} onRead={pinProcess} returnFocusTo={processButton} nodeKey={step.key} framed>
      <ToolActivity {...shared} entry={step.entry} motion={motion} turnClosed={boundary.status === 'closed'} onRead={pinProcess} />
      {step.entry.block && <ToolMedia {...shared} block={step.entry.block} />}
    </ProcessFragment></BlockBoundary>;
    if (step.kind === 'user') return <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={step.nodeKey} /></BlockBoundary>;
    return <Fragment>
      <BlockBoundary><ProcessNode useChat={useFlowChat} t={props.t} nodeKey={step.nodeKey} open={processOpen} motion={motion} onRead={pinProcess} returnFocusTo={processButton} /></BlockBoundary>
      <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={step.nodeKey} pinned={pinnedKeys.includes(step.nodeKey)} processOpen={processOpen} /></BlockBoundary>
    </Fragment>;
  };
  return <section className={css.turn} data-reader-turn={group.turn ?? 'unresolved'} data-reader-turn-state={boundary.status} data-reader-turn-result={boundary.reason ?? undefined}>
    {startsWithUser && <BlockBoundary><MainNode {...shared} useChat={props.useChat} boundary={boundary} nodeKey={group.keys[0]} /></BlockBoundary>}
    {hasProcess && !isAwaitingModel && <StickyLane kind="status" className={css.turnProcessSticky}>
      <Disclosure open={expanded} onChange={setExpanded} controls={flowId} buttonRef={processButton}
        label={<GroupStatus group={group} sessionId={props.sessionId} useChat={props.useChat} useSessionPendingInteraction={props.useSessionPendingInteraction} motion={motion} />} />
    </StickyLane>}
    {boundary.status === 'closed' && hasProcess && autoFold && <ClosedProcessSummary open={expanded} onChange={setExpanded} controls={flowId}
      steps={steps.filter(step => {
        if (step.kind === 'user') return false;
        if (step.kind !== 'body') return true;
        const node = nodes.get(step.nodeKey);
        return !!node && isNode(node, 'assistant-step') && (isEarlierNarration(node.data, boundary)
          || node.data.blocks.some(block => block.kind === 'tool-call')
          || (boundary.latestStep > 0 && node.data.step < boundary.latestStep));
      })} />}
    <ChoreographedFlow id={flowId} frame={presentation} motion={motion} enabled={autoFold && (boundary.status === 'open' || !!settled) && !holdingSelection}
      urgent={hasTurnError || interaction !== undefined || !sessionRunning} open={foldOpenByKey}
      processOpen={expanded}
      onOpenChange={(key, value) => { setFoldOpenByKey(current => ({ ...current, [key]: value })); }} renderStep={renderStep} />
    {/* 状态指示永远排在流程之后：AI 的响应永远出现在最新消息（含补充消息）的下方 */}
    {!hasProcess && boundary.status === 'open' && !isAwaitingModel && <div className={css.disclosure} data-reader-status-only>
      <GroupStatus group={group} useChat={props.useChat} useSession={props.useSession} motion={motion} />
    </div>}
    {showDeliverablesRow(boundary.status, deliverables) && <DeliverablesRow deliverables={deliverables} openFile={props.openFile} revealFile={props.revealFile} openMode={openMode} />}
    {boundary.status === 'closed' && <BlockBoundary><OfficialTail official={official} owner={tailOwner} produced={deliverables} /></BlockBoundary>}
    {showTerminalNotice && <div className={css.notice} data-reader-terminal>{terminal}</div>}
  </section>;
});

export function Reader(props: ReaderProps) {
  const root = useRef<HTMLDivElement>(null);
  const activatedAt = useRef(Date.now());
  const order = props.useChat(snapshot => snapshot.order);
  const nodes = props.useChat(snapshot => snapshot.nodes);
  const timeline = props.useChat(snapshot => snapshot.timeline);
  const running = props.useSession(snapshot => snapshot.running);
  const pending = props.useSessionPendingInteraction(snapshot => snapshot.get(props.sessionId));
  const openError = props.useSession(snapshot => snapshot.openError);
  const loading = props.useSession(snapshot => snapshot.openState === 'loading');
  const hasMore = props.useSession(snapshot => snapshot.hasMore);
  const loadingOlder = props.useSession(snapshot => snapshot.loadingOlder);
  const pendingSubmissions = props.useSession(snapshot => snapshot.pendingSubmissions);
  const pendingList = asReadonlyArray<PendingSubmissionEcho>(pendingSubmissions);
  const waitAnchor = waitingAnchor(order, key => nodes.get(key), pendingList);
  const motionPreference = props.useStore(state => state.motion);
  const motion = useMotionAllowed(motionPreference);
  const prefsSnap = useSyncExternalStore(
    props.openPrefs?.subscribe ?? ((fn: () => void) => { void fn; return () => {}; }),
    () => props.openPrefs?.getSnapshot?.(),
    () => undefined,
  );
  const storeAutoFold = props.useStore(state => state.autoFold);
  const autoFold = prefsSnap?.autoFold ?? (prefsSnap?.foldIntensity !== undefined ? prefsSnap.foldIntensity !== 0 : undefined) ?? storeAutoFold ?? true;
  const previousAutoFold = useRef(autoFold);
  useLayoutEffect(() => {
    const restored = autoFold && !previousAutoFold.current;
    previousAutoFold.current = autoFold;
    // Watch the effective preference so toolbar and Settings changes behave alike.
    // Reading while folding is off must not pin completed process content forever.
    if (restored) props.actions.resetExpanded();
  }, [autoFold, props.actions]);
  const frostedGlass = frostedGlassOf(prefsSnap);
  // Orthogonal to autoFold: the slider decides how much process to fold, this
  // decides whether the model's user-facing text is foldable at all.
  const keepProse = keepProseOf(prefsSnap);
  const keepToolSemantics = keepToolSemanticsOf(prefsSnap);
  const foldLevel = foldIntensityOf(prefsSnap);
  void keepToolSemantics;
  const streamMotion = useMemo(() => ({ enabled: motion, activatedAt: activatedAt.current }), [motion]);
  const groups = useMemo(() => groupNodes(order, key => nodes.get(key)), [order, nodes, timeline]);
  const isAwaitingModel = useMemo(() => {
    // 状态机铁律：「深度求索中」与「正在处理/思考」永远互斥。
    // 1. 仅空闲发送（!running）的本地回显窗口：用户按下回车第 0 毫秒立即反馈。
    //    忙碌时的 queued/steering 回显不算等待——模型本来就在工作。
    if (!running && pendingList.length > 0) return true;

    const lastKey = order.at(-1);
    const lastNode = lastKey ? nodes.get(lastKey) : undefined;
    if (!lastKey || !lastNode) return false;

    // 2. 模型已经产出内容：等待结束，计时器必须立刻消失。
    //    「产出」= assistant-step 已带 block（正文/思维链/工具调用都算）。
    if (lastNode.kind === 'assistant-step') {
      const data = lastNode.data as { status?: string; blocks?: unknown[] };
      const blocks = data.blocks ?? [];
      // 空 block 且仍在跑 = 请求已发出、模型还没吐字，正是要计时的那一刻。
      return blocks.length === 0 && data.status === 'running';
    }

    // 3. 球在模型脚下：用户刚发言，或工具已返回、上下文已注入、命令已执行。
    //    这些时刻模型随时可能卡住，正是要计时的地方；工具执行期间不计时，
    //    因为那时忙的是工具而不是模型。
    //    handsBackToModel 内部按 chat 层 kind 判定，并区分「工具已返回」与
    //    「工具仍在跑」——后者不算等待。
    const modelOwesResponse = handsBackToModel(lastNode);
    if (!modelOwesResponse) return false;

    // 轮次已结束就没什么可等的。
    const lastGroup = groups.at(-1);
    const turn = lastGroup?.turn === null || lastGroup?.turn === undefined ? undefined : timeline.turns.get(lastGroup.turn);
    return turn?.status !== 'closed';
  }, [running, pendingList, order, nodes, groups, timeline]);
  const scroll = useReadingScroll(root, motion);
  const pinnedKeys = usePinnedSelection(root);
  const selectedProcessKeys = usePinnedSelection(root, '[data-reader-process]');
  const [historyError, setHistoryError] = useState(false);

  // 1. Navigation items from Chat snapshot
  const turnNavigationItems = props.useChat(snapshot => snapshot.navigation?.items ? snapshot.navigation.items() : undefined);
  // 2. Whole-log turn outline projection
  const turnOutline = props.useProjection?.('turnOutline');
  // 3. Track turns with deliverables
  const turnsWithDeliverables = useMemo(() => {
    const set = new Set<number>();
    for (const [turnNum, loc] of timeline.turns) {
      const deliv = (loc.data as { get(key: string): unknown } | undefined)?.get('deliverables') as { produced?: unknown[] } | undefined;
      if (Array.isArray(deliv?.produced) && deliv.produced.length > 0) {
        set.add(turnNum);
      }
    }
    return set;
  }, [timeline]);

  // 4. Merged timeline items for the rail
  const timelineItems = useMemo(
    () => mergeTimelineItems(turnNavigationItems, turnOutline, turnsWithDeliverables),
    [turnNavigationItems, turnOutline, turnsWithDeliverables],
  );

  // 5. Active & busy turn tracking
  const [activeTurn, setActiveTurn] = useState<number | null>(null);
  const [busyTurn, setBusyTurn] = useState<number | null>(null);

  // Scroll spy to update activeTurn
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const scroller = el.closest('[data-conversation-scroll]') ?? el;

    let ticking = false;
    const updateActive = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        const line = (scroller instanceof HTMLElement ? scroller.clientHeight : window.innerHeight) * 0.35;
        const turnRows = el.querySelectorAll<HTMLElement>('[data-reader-turn]:not([data-reader-turn="unresolved"])');
        let current: number | null = null;
        for (const row of turnRows) {
          const rect = row.getBoundingClientRect();
          if (rect.top <= line) {
            const num = Number(row.dataset.readerTurn);
            if (Number.isSafeInteger(num)) current = num;
          } else {
            break;
          }
        }
        if (current !== null) {
          setActiveTurn(current);
        } else if (turnRows.length > 0) {
          const first = Number(turnRows[0].dataset.readerTurn);
          if (Number.isSafeInteger(first)) setActiveTurn(first);
        }
      });
    };

    scroller.addEventListener('scroll', updateActive, { passive: true });
    updateActive();
    return () => scroller.removeEventListener('scroll', updateActive);
  }, [groups]);

  // Navigation handler (supports loaded jump & unloaded loadThrough).
  // Land on the conversation scroller only — scrollIntoView also moves
  // ancestor boxes and can lift the sticky composer after a top→bottom jump.
  const onNavigateTurn = useCallback(async (item: TimelineItem) => {
    const el = root.current;
    if (!el) return;
    const port = scrollerOf(el);
    const reveal = (turn: number) => {
      const targetRow = el.querySelector<HTMLElement>(`[data-reader-turn="${turn}"]`);
      if (!targetRow) return;
      const last = timelineItems.at(-1);
      if (last !== undefined && last.turn === turn) {
        scroll.jump();
      } else {
        scroll.release();
        landTurn(targetRow, port);
      }
      setActiveTurn(turn);
    };

    if (item.anchor.kind === 'loaded') {
      reveal(item.turn);
      return;
    }

    setBusyTurn(item.turn);
    try {
      if (props.loadThrough) {
        await props.loadThrough(item.anchor.seq);
      } else {
        await props.loadOlder();
      }
      setTimeout(() => { reveal(item.turn); }, 50);
    } finally {
      setBusyTurn(null);
    }
  }, [props.loadThrough, props.loadOlder, scroll.jump, scroll.release, timelineItems]);

  const lastKey = order.at(-1);
  const lastNode = lastKey ? nodes.get(lastKey) : undefined;
  const lastSubmissionId = pendingList.length ? pendingList[pendingList.length - 1].requestId : null;
  const lastOrderKeyRef = useRef<string | undefined>(lastKey);
  const lastSubmissionRef = useRef<string | null>(lastSubmissionId);

  useLayoutEffect(() => {
    const appendedUser = lastKey !== lastOrderKeyRef.current && (lastNode?.kind === 'user' || lastNode?.kind === 'steering');
    const appendedSubmission = lastSubmissionId !== null && lastSubmissionId !== lastSubmissionRef.current;
    lastOrderKeyRef.current = lastKey;
    lastSubmissionRef.current = lastSubmissionId;

    if (appendedUser || appendedSubmission) {
      scroll.jump();
    }
  }, [lastKey, lastNode?.kind, lastSubmissionId, scroll]);

  const visibleSubmissions = useMemo(() => {
    if (pendingList.length === 0) return [];
    return pendingList.filter(sub => sub.placement !== 'queued');
  }, [pendingList]);

  // ChatView publishes data-chat-flow="" on its column. Skins treat a
  // scrollport without that hook as inspect-only and hide [data-composer-seat].
  return <StreamMotionContext.Provider value={streamMotion}><div ref={root} className={css.root} data-reader-build="0.3.0-preview.1" data-dsh-better-display="0.3.0-preview.1" data-reader-wait-clock-version="input-v1" data-reader-wait-start={waitAnchor.time ?? undefined} data-motion={motion ? 'on' : 'off'} data-reader-glass={frostedGlass || undefined} data-reader-auto-fold={autoFold ? 'on' : 'off'}>
    <TimelineRail items={timelineItems} activeTurn={activeTurn} busyTurn={busyTurn} onNavigate={onNavigateTurn} />
    <div className={css.column} data-chat-flow="">
      <StickyLane kind="toolbar" className={css.toolbar}>
        <button
          type="button"
          className={css.textButton}
          aria-pressed={autoFold}
          onClick={() => {
            props.actions.setAutoFold(!autoFold);
            props.openPrefs?.actions?.setAutoFold?.(!autoFold);
          }}
          title="新思考产生时，是否自动将此前步骤收拢为一行汇总。关闭后完整保留原始过程与流式输出。"
        >
          {`自动折叠${autoFold ? '开' : '关'}`}
        </button>
      </StickyLane>
      {hasMore && <button type="button" className={css.historyButton} disabled={loadingOlder} onClick={async () => {
        setHistoryError(false);
        try { await props.loadOlder(); } catch { setHistoryError(true); }
      }}>{loadingOlder ? '正在加载更早记录' : '加载更早记录'}</button>}
      {historyError && <div className={css.notice}>历史记录加载失败，可再次尝试；现有内容未改变。</div>}
      {openError && <div className={css.error} role="alert">会话暂时无法读取：{openError.message}</div>}
      {loading && groups.length === 0 && <p className={css.empty} role="status">正在读取会话…</p>}
      {groups.map(group => <TurnGroup key={group.key} {...props} group={group} motion={motion} autoFold={autoFold} pinnedKeys={pinnedKeys} selectedProcessKeys={selectedProcessKeys} isAwaitingModel={isAwaitingModel && group.key === groups.at(-1)?.key} />)}
      {visibleSubmissions.map(submission => {
        const images = pendingSubmissionImages(submission);
        return (
        <div key={submission.requestId} className={css.userCluster} data-reader-pending-submission>
          {images.length > 0 && (
            <div className={css.userImages}>
              {images.map((item, idx) => (
                <figure key={idx} className={css.imageFigure}>
                  <div className={css.imageFrame} style={{ aspectRatio: `${item.width || 4} / ${item.height || 3}` }}>
                    <img src={item.previewUrl} alt={item.name ?? '发送的图片'} className={css.pendingImage} />
                  </div>
                </figure>
              ))}
            </div>
          )}
          {submission.text ? (
            <div className={css.user}>
              <div className={css.blocks}>{submission.text}</div>
            </div>
          ) : null}
          <UserMessageActions text={submission.text ?? ''} time={submission.time} />
        </div>
        );
      })}
      {isAwaitingModel && <WaitingStatus anchor={waitAnchor} label={props.t ? props.t('chat.deepDiving') : '深度求索中...'} />}
      {pending !== undefined && <div className={css.attention} role="alert" data-reader-attention>
        <strong>{pending.kind === 'question' ? '需要你回答一个问题' : '需要你的确认'}</strong>
        <span>请在下方原生操作区处理。此提示不会收进执行过程。</span>
      </div>}
      {scroll.detached && <div className={css.jumpDock}><button type="button" className={css.jump} aria-label="回到底部" title="回到底部" onClick={scroll.jump}>
        <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden="true"><path d="M3 5.5 7 9.5 11 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button></div>}
    </div>
  </div></StreamMotionContext.Provider>;
}
