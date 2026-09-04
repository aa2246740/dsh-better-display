import { Fragment, memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ChatConversationViewNode, ChatNode, ChatNodeKind } from '@deepseek-ai/dsh-client-ui-chat/client';
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { BlockBoundary, Blocks, contentBlocks, CopyAnswer } from './Blocks.js';
import { ReasoningCard } from './ReasoningCard.js';
import { ToolActivity, ToolMedia } from './ToolActivity.js';
import { preparingLabel, readerFlow } from './tool-activity.js';
import { Disclosure, ProcessFragment, RetiringContent, StatusText, useMotionAllowed, usePinnedSelection, useReadingScroll } from './motion.js';
import { StreamMotionContext } from './streaming.js';
import { assistantSegments, boundaryOf, groupNodes, hasProcessContent, hasVisibleBody, isEarlierNarration, processChoiceKey, processExpanded, terminalLabel } from './projection.js';
import { ContextInjectionRow } from './native/ContextInjectionRow.js';
import type { ReaderGroup, TurnBoundary } from './projection.js';
import type { BlockRenderProps, ReaderProps } from './types.js';
import css from './Reader.module.css';
import { markdownLabels, truncatedJsonLabel } from './primitive-labels.js';

function isNode<K extends ChatNodeKind>(node: ChatConversationViewNode, kind: K): node is ChatNode<K> {
  return node.kind === kind;
}

type SeatProps = BlockRenderProps & Pick<ReaderProps, 'useChat'> & {
  nodeKey: string; boundary: TurnBoundary; pinned?: boolean; processOpen?: boolean;
};

const ProcessNode = memo(function ProcessNode({ useChat, t, nodeKey, open, motion, onRead, returnFocusTo }: Pick<ReaderProps, 'useChat' | 't'> & {
  nodeKey: string; open: boolean; motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>;
}) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden') return null;
  let content: ReactNode = null;
  if (isNode(node, 'context')) content = <ContextInjectionRow {...node.data} t={t} />;
  else if (isNode(node, 'model-retry')) content = <JsonBlock label="模型重试记录" payload={node.data.attempts} truncatedLabel={truncatedJsonLabel} />;
  else if (isNode(node, 'command') || isNode(node, 'manual-compaction')) content = <JsonBlock label="命令记录" payload={node.data} truncatedLabel={truncatedJsonLabel} />;
  return content && <ProcessFragment open={open} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey} framed>{content}</ProcessFragment>;
});

const AssistantNode = memo(function AssistantNode({ useChat, nodeKey, boundary, processOpen = false, pinned = false, motion, onRead, returnFocusTo, ...render }: SeatProps & {
  motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>;
}) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden' || !isNode(node, 'assistant-step')) return null;
  const data = node.data;
  const parts = assistantSegments(data.blocks);
  const earlier = isEarlierNarration(data, boundary);
  const body = data.blocks.filter(block => block.kind !== 'reasoning' && block.kind !== 'tool-call');
  return <>{parts.map((part, index) => part.kind === 'reasoning'
    ? <ProcessFragment key={part.start} open={processOpen} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey} framed>
      <ReasoningCard step={data.step} active={processOpen && boundary.status === 'open' && data.step === boundary.latestStep} motion={motion} selected={pinned} onRead={onRead}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running' && index === parts.length - 1 && data.blocks.at(-1)?.kind === 'reasoning'}
          holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
      </ReasoningCard>
    </ProcessFragment>
    : hasVisibleBody(part.blocks) && <RetiringContent key={part.start} visible={pinned || processOpen || !earlier}>
      <article className={css.answer} data-reader-answer data-reader-anchor data-reader-key={nodeKey} data-reader-source-start={part.start} data-answer-status={data.status} data-answer-phase={earlier ? 'process' : 'body'}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running'} holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
        {index === parts.length - 1 && data.status === 'interrupted' && <span className={css.stopped}>已停止</span>}
        {index === parts.length - 1 && !earlier && data.status !== 'running' && boundary.status === 'closed' && <CopyAnswer blocks={body} />}
      </article>
    </RetiringContent>)}</>;
});

const MainNode = memo(function MainNode({ useChat, nodeKey, boundary, pinned, processOpen = false, ...render }: SeatProps) {
  const node = useChat(snapshot => snapshot.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden') return null;
  if (isNode(node, 'user') || isNode(node, 'steering')) return <div className={css.user} data-reader-anchor data-reader-key={nodeKey}>
    {node.kind === 'steering' && <p className={css.meta}>补充消息</p>}
    <Blocks {...render} blocks={contentBlocks(node.data.content)} source="user" />
  </div>;
  if (isNode(node, 'assistant-step')) return null;
  if (isNode(node, 'tool-call')) return <ToolMedia {...render} block={node.data.root} />;
  if (isNode(node, 'turn-error')) return <div className={css.error} role="alert" data-reader-anchor>
    <strong>本轮出现错误</strong><p>{node.data.message}</p>{node.data.code && <code>{node.data.code}</code>}
  </div>;
  if (isNode(node, 'turn-max-tokens')) return <div className={css.notice}>已到达输出长度限制，回答尚未完整。</div>;
  if (isNode(node, 'model-retry')) return node.data.current.retryState === 'scheduled'
    ? <div className={css.notice} role="status">模型请求未成功，正在等待重试。详情保留在执行过程中。</div> : null;
  if (isNode(node, 'command')) {
    if (node.data.outcome?.kind === 'error') return <div className={css.error} role="alert">命令执行失败：{node.data.outcome.text ?? node.data.name ?? '查看原对话中的命令记录'}</div>;
    return node.data.outcome?.text ? <MarkdownText text={node.data.outcome.text} labels={markdownLabels} /> : null;
  }
  if (isNode(node, 'manual-compaction')) {
    if (node.data.command.outcome?.kind === 'error') return <div className={css.error} role="alert">上下文压缩失败：{node.data.command.outcome.text}</div>;
    return node.data.compaction ? <p className={css.meta}>上下文已整理，原始记录仍保留。</p> : <p className={css.meta}>正在整理上下文…</p>;
  }
  if (node.kind === 'compaction') return <details className={css.detail}><summary>上下文已整理，查看记录</summary><JsonBlock label="压缩记录" payload={node.data} truncatedLabel={truncatedJsonLabel} /></details>;
  if (node.kind === 'context' || node.kind === 'turn-tail') return null;
  return <div className={css.unknown} data-reader-anchor>
    <p>此记录类型暂未接入阅读页：{node.kind}</p>
    <JsonBlock label="查看原始记录" payload={node.data} truncatedLabel={truncatedJsonLabel} />
  </div>;
});

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
    if (current?.status === 'running' && last?.kind === 'tool-call') return preparingLabel(last.name);
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

const TurnGroup = memo(function TurnGroup({ group, motion, pinnedKeys, selectedProcessKeys, ...props }: ReaderProps & { group: ReaderGroup; motion: boolean; pinnedKeys: readonly string[]; selectedProcessKeys: readonly string[] }) {
  const chat = props.useChat(snapshot => snapshot);
  const turn = props.useChat(snapshot => group.turn === null ? undefined : snapshot.timeline.turns.get(group.turn));
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
  const flow = useMemo(() => readerFlow({ ...group, keys: mainKeys }, turn, key => chat.nodes.get(key)), [chat, group, mainKeys, turn]);
  const hasProcess = flow.some(item => item.kind === 'tool' || hasProcessContent(chat.nodes.get(item.nodeKey), boundary));
  // Only a real, still-active text selection delays folding. Merely clicking,
  // focusing or scrolling the live card does not create a permanent override.
  const holdingSelection = flow.some(item => selectedProcessKeys.includes(item.key));
  const expanded = holdingSelection || processExpanded(expansionChoice, boundary);
  const shared = { useChat: props.useChat, renderSlotChain: props.renderSlotChain, loadImage: props.loadImage };
  const terminal = terminalLabel(boundary.reason);
  return <section className={css.turn} data-reader-turn={group.turn ?? 'unresolved'} data-reader-turn-state={boundary.status} data-reader-turn-result={boundary.reason ?? undefined}>
    {startsWithUser && <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={group.keys[0]} /></BlockBoundary>}
    {hasProcess && <Disclosure open={expanded} onChange={setExpanded} controls={flowId} buttonRef={processButton}
      label={<GroupStatus group={group} sessionId={props.sessionId} useChat={props.useChat} useSessionPendingInteraction={props.useSessionPendingInteraction} motion={motion} />} status={turn?.steps.length ? `${turn.steps.length} 个步骤` : undefined} />}
    {!hasProcess && boundary.status === 'open' && <div className={css.disclosure} data-reader-status-only>
      <GroupStatus group={group} sessionId={props.sessionId} useChat={props.useChat} useSessionPendingInteraction={props.useSessionPendingInteraction} motion={motion} />
    </div>}
    <div id={flowId} className={css.mainFlow} data-reader-flow>
      {flow.map(item => item.kind === 'node' ? <Fragment key={item.key}>
        <BlockBoundary><ProcessNode useChat={props.useChat} t={props.t} nodeKey={item.nodeKey} open={expanded} motion={motion} onRead={pinProcess} returnFocusTo={processButton} /></BlockBoundary>
        <BlockBoundary><AssistantNode {...shared} boundary={boundary} nodeKey={item.nodeKey} pinned={pinnedKeys.includes(item.nodeKey)} processOpen={expanded} motion={motion} onRead={pinProcess} returnFocusTo={processButton} /></BlockBoundary>
        <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={item.nodeKey} pinned={pinnedKeys.includes(item.nodeKey)} processOpen={expanded} /></BlockBoundary>
      </Fragment> : <Fragment key={item.key}>
        <BlockBoundary><ProcessFragment open={expanded} motion={motion} onRead={pinProcess} returnFocusTo={processButton} nodeKey={item.key} framed>
          <ToolActivity {...shared} entry={item} motion={motion} turnClosed={boundary.status === 'closed'} onRead={pinProcess} />
        </ProcessFragment></BlockBoundary>
        {item.block && <BlockBoundary><ToolMedia {...shared} block={item.block} /></BlockBoundary>}
      </Fragment>)}
    </div>
    {terminal && <div className={css.notice} data-reader-terminal>{terminal}</div>}
  </section>;
});

export function Reader(props: ReaderProps) {
  const root = useRef<HTMLDivElement>(null);
  const activatedAt = useRef(Date.now());
  const order = props.useChat(snapshot => snapshot.order);
  const nodes = props.useChat(snapshot => snapshot.nodes);
  const timeline = props.useChat(snapshot => snapshot.timeline);
  const pending = props.useSessionPendingInteraction(snapshot => snapshot.get(props.sessionId));
  const openError = props.useSession(snapshot => snapshot.openError);
  const loading = props.useSession(snapshot => snapshot.openState === 'loading');
  const hasMore = props.useSession(snapshot => snapshot.hasMore);
  const loadingOlder = props.useSession(snapshot => snapshot.loadingOlder);
  const motionPreference = props.useStore(state => state.motion);
  const motion = useMotionAllowed(motionPreference);
  const streamMotion = useMemo(() => ({ enabled: motion, activatedAt: activatedAt.current }), [motion]);
  const groups = useMemo(() => groupNodes(order, key => nodes.get(key)), [order, nodes, timeline]);
  const scroll = useReadingScroll(root, motion);
  const pinnedKeys = usePinnedSelection(root);
  const selectedProcessKeys = usePinnedSelection(root, '[data-reader-process]');
  const [historyError, setHistoryError] = useState(false);
  return <StreamMotionContext.Provider value={streamMotion}><div ref={root} className={css.root} data-dsh-better-display="0.1.0" data-motion={motion ? 'on' : 'off'}>
    <div className={css.column}>
      <div className={css.toolbar} data-ud-check="reader-toolbar">
        <span title="基于真实消息类型和轮次边界整理。当前协议没有独立的正文阶段标记，无法确认的内容会继续保留。">阅读 · 原始记录完整保留</span>
        <button type="button" className={css.textButton} aria-pressed={motionPreference} onClick={() => props.actions.setMotion(!motionPreference)} title="新到文字柔和显现，过程平滑展开；关闭后立即完整显示，自动遵循系统减少动态效果设置。">{motionPreference && !motion ? '动效 · 跟随系统关闭' : `动效${motionPreference ? '开' : '关'}`}</button>
      </div>
      {hasMore && <button type="button" className={css.historyButton} disabled={loadingOlder} onClick={async () => {
        setHistoryError(false);
        try { await props.loadOlder(); } catch { setHistoryError(true); }
      }}>{loadingOlder ? '正在加载更早记录' : '加载更早记录'}</button>}
      {historyError && <div className={css.notice}>历史记录加载失败，可再次尝试；现有内容未改变。</div>}
      {openError && <div className={css.error} role="alert">会话暂时无法读取：{openError.message}</div>}
      {loading && groups.length === 0 && <p className={css.empty} role="status">正在读取会话…</p>}
      {groups.map(group => <TurnGroup key={group.key} {...props} group={group} motion={motion} pinnedKeys={pinnedKeys} selectedProcessKeys={selectedProcessKeys} />)}
      {pending !== undefined && <div className={css.attention} role="alert" data-reader-attention>
        <strong>{pending.kind === 'question' ? '需要你回答一个问题' : '需要你的确认'}</strong>
        <span>请在下方原生操作区处理。此提示不会收进执行过程。</span>
      </div>}
      {scroll.detached && <div className={css.jumpDock}><button type="button" className={css.jump} onClick={scroll.jump}>↓ 回到最新</button></div>}
    </div>
  </div></StreamMotionContext.Provider>;
}
