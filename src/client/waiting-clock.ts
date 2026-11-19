import type { ChatNodeKind } from '@deepseek-ai/dsh-client-ui-chat/client';

export interface WaitingAnchor { key: string; time: number | null }
type InputNode = { kind: string; data: unknown };
type Submission = { requestId: string; time?: number; placement?: string };
const timestamp = (value: number | undefined): number | null => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/**
 * Chat-layer kinds that hand the turn back to the model unconditionally.
 *
 * These are `ChatNodeDataMap` keys, NOT conversation-layer `ConversationNode` kinds.
 * The two layers name the same idea differently: a returned tool is `tool-result`
 * in the conversation contract, but the row the reader sees is the `tool-call` node.
 * A name copied from the wrong layer silently disables the branch it guards, so
 * the `satisfies` below makes the compiler reject any name that is not a real kind.
 */
export const WAIT_AFTER = new Set<ChatNodeKind>(['context', 'model-retry']);

/**
 * Every chat-kind the handover logic reasons about, checked against the host's own
 * kind union at compile time. Adding a name here that the host does not register
 * fails `tsc` instead of failing silently at runtime.
 */
export const HANDOVER_KINDS = [
  'user', 'steering', 'context', 'model-retry', 'tool-call', 'command',
] as const satisfies readonly ChatNodeKind[];

/**
 * Mirrors the host's `isSettledTool`: a running call has no `kind`, a settled one
 * carries `kind: 'tool-result'`. Kept local so this module stays dependency-free,
 * and pinned by a test against the host's own helper contract.
 */
function toolSettled(data: unknown): boolean {
  const root = (data as { root?: unknown } | undefined)?.root;
  return typeof root === 'object' && root !== null && (root as { kind?: unknown }).kind === 'tool-result';
}

/** A command that is still executing has no outcome yet. */
function commandSettled(data: unknown): boolean {
  return (data as { outcome?: unknown } | undefined)?.outcome != null;
}

/**
 * A settled command hands over only while the host reports the session running.
 *
 * Commands are log-only: `command/run` and `command/done` open no turn. A command
 * that goes on to start a turn flips the session's running bit, and from then on
 * the model owes the next move. A UI-only command (`/preset` from
 * dsh-preset-switch) settles with the session idle and starts nothing, so nobody
 * will answer it (#86). The host's own status row (`ChatFlow` → `RunningStatus`)
 * mounts on the same bit. The rule reads only the running bit, so a reloaded
 * session, whose command rows are still in the log, is decided the same way.
 */
function commandHandsOver(data: unknown, running: boolean): boolean {
  return running && commandSettled(data);
}

/**
 * Does this node leave the model on the hook for the next move?
 *
 * A tool or command that is *still running* is not a wait — the tool is the one
 * working. Only its returned form hands control back, which is exactly the moment
 * the model can stall. A settled command also needs `running`; see
 * {@link commandHandsOver}.
 *
 * @param running - the host's session running bit.
 */
export function handsBackToModel(node: InputNode, running: boolean): boolean {
  if (node.kind === 'user' || node.kind === 'steering') return true;
  if (node.kind === 'tool-call') return toolSettled(node.data);
  if (node.kind === 'command') return commandHandsOver(node.data, running);
  return WAIT_AFTER.has(node.kind as ChatNodeKind);
}

/**
 * The moment the current wait began.
 *
 * This is the time of the **last** node that handed control to the model — a
 * returned tool, an injected context, or the user's own message. Anchoring on the
 * user's message alone made the readout count the entire turn, so a wait that had
 * only just begun showed the minutes the tools had already spent.
 */
export function waitingAnchor(order: readonly string[], get: (key: string) => InputNode | undefined, pending: readonly Submission[], running: boolean): WaitingAnchor {
  let anchor: WaitingAnchor = { key: 'unresolved', time: null };
  for (let i = order.length - 1; i >= 0; i--) {
    const node = get(order[i]);
    if (!node) continue;
    if (!handsBackToModel(node, running)) continue;
    const time = node.data && typeof node.data === 'object' && 'time' in node.data && typeof node.data.time === 'number' ? node.data.time : undefined;
    anchor = { key: order[i], time: timestamp(time) };
    break;
  }
  for (let i = pending.length - 1; i >= 0; i--) {
    const input = pending[i];
    if (input.placement === 'queued') continue;
    const time = timestamp(input.time);
    if (time === null || anchor.time === null || time >= anchor.time) return { key: `pending:${input.requestId}`, time };
    break;
  }
  return anchor;
}

export interface AwaitingModelInput {
  /** The host's session running bit. */
  running: boolean;
  /** Local submission echoes (`SessionSnapshot.pendingSubmissions`). */
  pending: readonly Submission[];
  /** Rendered chat keys, oldest first. */
  order: readonly string[];
  get: (key: string) => InputNode | undefined;
  /** Status of the turn the last rendered group belongs to; undefined when that group has no turn. */
  lastTurnStatus: string | undefined;
}

/**
 * Should the reader show the "深度求索中" wait after the last row?
 *
 * 状态机铁律：「深度求索中」与「正在处理/思考」永远互斥。
 */
export function awaitingModel({ running, pending, order, get, lastTurnStatus }: AwaitingModelInput): boolean {
  // 1. 仅空闲发送（!running）的本地回显窗口：用户按下回车第 0 毫秒立即反馈。
  //    忙碌时的 queued/steering 回显不算等待——模型本来就在工作。
  if (!running && pending.length > 0) return true;

  const lastKey = order.at(-1);
  const lastNode = lastKey ? get(lastKey) : undefined;
  if (!lastKey || !lastNode) return false;

  // 2. 模型已经产出内容：等待结束，计时器必须立刻消失。
  //    「产出」= assistant-step 已带 block（正文/思维链/工具调用都算）。
  if (lastNode.kind === 'assistant-step') {
    const data = lastNode.data as { status?: string; blocks?: unknown[] } | undefined;
    const blocks = data?.blocks ?? [];
    // 空 block 且仍在跑 = 请求已发出、模型还没吐字，正是要计时的那一刻。
    return blocks.length === 0 && data?.status === 'running';
  }

  // 3. 球在模型脚下：用户刚发言，或工具已返回、上下文已注入，或命令已执行
  //    且宿主报告会话在运行（命令开了新一轮）。纯 UI 命令执行完会话仍空闲，
  //    没有人会接球，不算等待（#86）。工具执行期间不计时，因为那时忙的是
  //    工具而不是模型。
  if (!handsBackToModel(lastNode, running)) return false;

  // 轮次已结束就没什么可等的。
  return lastTurnStatus !== 'closed';
}
