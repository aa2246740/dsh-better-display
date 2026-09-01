import { Fragment, memo, useCallback, useId, useMemo, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { ChatConversationViewNode } from '@deepseek-ai/dsh-client-runtime/client';
import type { ChatNode, ChatNodeKind } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { JsonBlock, MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { BlockBoundary, Blocks, contentBlocks, CopyAnswer } from './Blocks.js';
import { ReasoningCard } from './ReasoningCard.js';
import { ToolActivity, ToolMedia } from './ToolActivity.js';
import { preparingLabel, readerFlow } from './tool-activity.js';
import { Disclosure, ProcessFragment, RetiringContent, StatusText, useMotionAllowed, usePinnedSelection, useReadingScroll } from './motion.js';
import { StreamMotionContext } from './streaming.js';
import { assistantSegments, boundaryOf, groupNodes, hasProcessContent, hasVisibleBody, isEarlierNarration, processChoiceKey, processExpanded, terminalLabel } from './projection.js';
import { presentLiveTurn, segmentLiveTurn } from './live-turn.js';
import type { LiveStep } from './live-turn.js';
import { PriorChainFold } from './LiveFold.js';
import { ContextInjectionRow } from './native/ContextInjectionRow.js';
import type { ReaderGroup, TurnBoundary } from './projection.js';
import type { BlockRenderProps, ReaderProps } from './types.js';
import css from './Reader.module.css';

function isNode<K extends ChatNodeKind>(node: ChatConversationViewNode, kind: K): node is ChatNode<K> {
  return node.kind === kind;
}

type SeatProps = BlockRenderProps & Pick<ReaderProps, 'useSession'> & {
  nodeKey: string; boundary: TurnBoundary; pinned?: boolean; processOpen?: boolean;
};

const ProcessNode = memo(function ProcessNode({ useSession, t, nodeKey, open, motion, onRead, returnFocusTo }: Pick<ReaderProps, 'useSession' | 't'> & {
  nodeKey: string; open: boolean; motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>;
}) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden') return null;
  let content: ReactNode = null;
  if (isNode(node, 'context')) content = <ContextInjectionRow {...node.data} t={t} />;
  else if (isNode(node, 'model-retry')) content = <JsonBlock label="模型重试记录" payload={node.data.attempts} />;
  else if (isNode(node, 'command') || isNode(node, 'manual-compaction')) content = <JsonBlock label="命令记录" payload={node.data} />;
  return content && <ProcessFragment open={open} motion={motion} onRead={onRead} returnFocusTo={returnFocusTo} nodeKey={nodeKey} framed>{content}</ProcessFragment>;
});

const AssistantNode = memo(function AssistantNode({ useSession, nodeKey, boundary, processOpen = false, pinned = false, folded = false, partStart, motion, onRead, returnFocusTo, ...render }: SeatProps & {
  motion: boolean; onRead: () => void; returnFocusTo: RefObject<HTMLButtonElement>; partStart?: number; folded?: boolean;
}) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey));
  if (!node || node.visibility === 'hidden' || !isNode(node, 'assistant-step')) return null;
  const data = node.data;
  const parts = assistantSegments(data.blocks);
  const earlier = isEarlierNarration(data, boundary);
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
    : hasVisibleBody(part.blocks) && <RetiringContent key={part.start} visible={pinned || processOpen || (!earlier && !folded)}>
      <article className={css.answer} data-reader-answer data-reader-anchor data-reader-key={nodeKey} data-reader-source-start={part.start} data-answer-status={data.status} data-answer-phase={earlier || folded ? 'process' : 'body'}>
        <Blocks {...render} blocks={part.blocks} streaming={data.status === 'running'} holdFormatting={pinned} startedAt={data.time} interrupted={data.status === 'interrupted'} liveText />
        {last && data.status === 'interrupted' && <span className={css.stopped}>已停止</span>}
        {last && !earlier && !folded && data.status !== 'running' && boundary.status === 'closed' && <CopyAnswer blocks={body} />}
      </article>
    </RetiringContent>;
  })}</>;
});

const MainNode = memo(function MainNode({ useSession, nodeKey, boundary, pinned, processOpen = false, ...render }: SeatProps) {
  const node = useSession(snapshot => snapshot.chat.nodes.get(nodeKey));
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
    return node.data.outcome?.text ? <MarkdownText text={node.data.outcome.text} /> : null;
  }
  if (isNode(node, 'manual-compaction')) {
    if (node.data.command.outcome?.kind === 'error') return <div className={css.error} role="alert">上下文压缩失败：{node.data.command.outcome.text}</div>;
    return node.data.compaction ? <p className={css.meta}>上下文已整理，原始记录仍保留。</p> : <p className={css.meta}>正在整理上下文…</p>;
  }
  if (node.kind === 'compaction') return <details className={css.detail}><summary>上下文已整理，查看记录</summary><JsonBlock label="压缩记录" payload={node.data} /></details>;
  if (node.kind === 'context' || node.kind === 'turn-tail') return null;
  return <div className={css.unknown} data-reader-anchor>
    <p>此记录类型暂未接入阅读页：{node.kind}</p>
    <JsonBlock label="查看原始记录" payload={node.data} />
  </div>;
});

function GroupStatus({ group, useSession, motion }: Pick<ReaderProps, 'useSession'> & { group: ReaderGroup; motion: boolean }) {
  const text = useSession(snapshot => {
    const turn = group.turn === null ? undefined : snapshot.chat.timeline.turns.get(group.turn);
    if (turn?.status === 'closed') {
      if (turn.end?.data.reason.kind !== 'completed') return '执行过程';
      const elapsed = turn.start && turn.end ? Math.max(0, Math.round((turn.end.time - turn.start.time) / 1000)) : null;
      return elapsed === null ? '执行过程' : elapsed < 60 ? `用时 ${elapsed} 秒` : `用时 ${Math.floor(elapsed / 60)} 分 ${elapsed % 60} 秒`;
    }
    if (turn?.status !== 'open') return '执行过程';
    if (snapshot.pending.length) return '等待你的操作';
    const current = turn.steps.at(-1)?.data.get('assistant-step');
    const last = current?.blocks.at(-1);
    if (current?.status === 'running' && last?.kind === 'tool-call') return preparingLabel(last.name);
    for (let index = group.keys.length - 1; index >= 0; index--) {
      const node = snapshot.chat.nodes.get(group.keys[index]);
      if (!node) continue;
      if (isNode(node, 'tool-call') && !('kind' in node.data.root)) return '正在使用工具';
      if (isNode(node, 'assistant-step') && node.data.status === 'running') {
        const last = node.data.blocks.at(-1);
        return last?.kind === 'reasoning' ? '正在思考' : last?.kind === 'text' ? '正在输出' : '正在准备回复';
      }
    }
    return '正在处理';
  });
  const busy = useSession(snapshot => group.turn !== null && snapshot.chat.timeline.turns.get(group.turn)?.status === 'open' && snapshot.pending.length === 0);
  return <StatusText text={text} motion={motion} shimmer={busy} />;
}

const TurnGroup = memo(function TurnGroup({ group, motion, pinnedKeys, selectedProcessKeys, ...props }: ReaderProps & { group: ReaderGroup; motion: boolean; pinnedKeys: readonly string[]; selectedProcessKeys: readonly string[] }) {
  const chat = props.useSession(snapshot => snapshot.chat);
  const turn = props.useSession(snapshot => group.turn === null ? undefined : snapshot.chat.timeline.turns.get(group.turn));
  const boundary = useMemo(() => boundaryOf(turn), [turn]);
  const choiceKey = processChoiceKey(group.key, boundary);
  const expansionChoice = props.useStore(state => state.expanded[choiceKey]);
  const flowId = useId();
  const processButton = useRef<HTMLButtonElement>(null);
  const setExpanded = useCallback((value: boolean) => props.actions.setExpanded(choiceKey, value), [props.actions, choiceKey]);
  const pinProcess = useCallback(() => setExpanded(true), [setExpanded]);
  const firstKind = props.useSession(snapshot => snapshot.chat.nodes.get(group.keys[0])?.kind);
  const startsWithUser = firstKind === 'user';
  const mainKeys = startsWithUser ? group.keys.slice(1) : group.keys;
  const flow = useMemo(() => readerFlow({ ...group, keys: mainKeys }, turn, key => chat.nodes.get(key)), [chat, group, mainKeys, turn]);
  const steps = useMemo(() => segmentLiveTurn(flow, key => chat.nodes.get(key)), [flow, chat]);
  const liveItems = useMemo(() => presentLiveTurn(steps, boundary), [steps, boundary]);
  const hasProcess = flow.some(item => item.kind === 'tool' || hasProcessContent(chat.nodes.get(item.nodeKey), boundary));
  // Only a real, still-active text selection delays folding. Merely clicking,
  // focusing or scrolling the live card does not create a permanent override.
  const holdingSelection = selectedProcessKeys.some(key =>
    flow.some(item => item.key === key)
    || liveItems.some(item => item.kind === 'fold'
      ? item.key === key || item.steps.some(step => step.key === key || ('nodeKey' in step && step.nodeKey === key))
      : item.key === key || ('nodeKey' in item.step && item.step.nodeKey === key)));
  const expanded = holdingSelection || processExpanded(expansionChoice, boundary);
  const [foldOpenByKey, setFoldOpenByKey] = useState<Record<string, boolean>>({});
  const shared = { useSession: props.useSession, renderSlotChain: props.renderSlotChain, loadImage: props.loadImage };
  const terminal = terminalLabel(boundary.reason);
  const renderStep = (step: LiveStep, processOpen: boolean, folded: boolean) => {
    if (step.kind === 'reasoning' || step.kind === 'body') return <BlockBoundary>
      <AssistantNode {...shared} boundary={boundary} nodeKey={step.nodeKey} partStart={step.start} pinned={pinnedKeys.includes(step.nodeKey)} processOpen={processOpen} folded={folded} motion={motion} onRead={pinProcess} returnFocusTo={processButton} />
    </BlockBoundary>;
    if (step.kind === 'tool') return <Fragment>
      <BlockBoundary><ProcessFragment open={processOpen} motion={motion} onRead={pinProcess} returnFocusTo={processButton} nodeKey={step.key} framed>
        <ToolActivity {...shared} entry={step.entry} motion={motion} turnClosed={boundary.status === 'closed'} onRead={pinProcess} />
      </ProcessFragment></BlockBoundary>
      {step.entry.block && <BlockBoundary><ToolMedia {...shared} block={step.entry.block} /></BlockBoundary>}
    </Fragment>;
    if (step.kind === 'user') return <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={step.nodeKey} /></BlockBoundary>;
    return <Fragment>
      <BlockBoundary><ProcessNode useSession={props.useSession} t={props.t} nodeKey={step.nodeKey} open={processOpen} motion={motion} onRead={pinProcess} returnFocusTo={processButton} /></BlockBoundary>
      <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={step.nodeKey} pinned={pinnedKeys.includes(step.nodeKey)} processOpen={processOpen} /></BlockBoundary>
    </Fragment>;
  };
  return <section className={css.turn} data-reader-turn={group.turn ?? 'unresolved'} data-reader-turn-state={boundary.status} data-reader-turn-result={boundary.reason ?? undefined}>
    {startsWithUser && <BlockBoundary><MainNode {...shared} boundary={boundary} nodeKey={group.keys[0]} /></BlockBoundary>}
    {hasProcess && <Disclosure open={expanded} onChange={setExpanded} controls={flowId} buttonRef={processButton}
      label={<GroupStatus group={group} useSession={props.useSession} motion={motion} />} status={turn?.steps.length ? `${turn.steps.length} 个步骤` : undefined} />}
    {!hasProcess && boundary.status === 'open' && <div className={css.disclosure} data-reader-status-only>
      <GroupStatus group={group} useSession={props.useSession} motion={motion} />
    </div>}
    <div id={flowId} className={css.mainFlow} data-reader-flow>
      {liveItems.flatMap(item => {
        if (item.kind === 'fold') {
          const foldOpen = foldOpenByKey[item.key] ?? false;
          return [
            <PriorChainFold key={item.key} summary={item.summary} motion={motion} foldOpen={foldOpen}
              onFoldOpenChange={value => setFoldOpenByKey(current => current[item.key] === value ? current : { ...current, [item.key]: value })}
              processKey={item.key} processOpen={expanded} onRead={pinProcess} returnFocusTo={processButton} />,
            ...item.steps.map(step => <Fragment key={step.key}>{renderStep(step, expanded && foldOpen, true)}</Fragment>),
          ];
        }
        return [<Fragment key={item.key}>{renderStep(item.step, expanded, false)}</Fragment>];
      })}
    </div>
    {terminal && <div className={css.notice} data-reader-terminal>{terminal}</div>}
  </section>;
});

export function Reader(props: ReaderProps) {
  const root = useRef<HTMLDivElement>(null);
  const activatedAt = useRef(Date.now());
  const order = props.useSession(snapshot => snapshot.chat.order);
  const nodes = props.useSession(snapshot => snapshot.chat.nodes);
  const timeline = props.useSession(snapshot => snapshot.chat.timeline);
  const pending = props.useSession(snapshot => snapshot.pending);
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
  return <StreamMotionContext.Provider value={streamMotion}><div ref={root} className={css.root} data-dsh-better-display="0.1.1" data-motion={motion ? 'on' : 'off'}>
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
      {pending.length > 0 && <div className={css.attention} role="alert" data-reader-attention>
        <strong>{pending.some(item => item.kind === 'question') ? '需要你回答一个问题' : '需要你的确认'}</strong>
        <span>请在下方原生操作区处理。此提示不会收进执行过程。</span>
      </div>}
      {scroll.detached && <div className={css.jumpDock}><button type="button" className={css.jump} onClick={scroll.jump}>↓ 回到最新</button></div>}
    </div>
  </div></StreamMotionContext.Provider>;
}
