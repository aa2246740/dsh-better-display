import type { AssistantChatData, ChatConversationViewNode } from '@deepseek-ai/dsh-client-ui-chat/client';
import type { AssistantBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import { assistantSegments, hasVisibleBody } from './projection.js';
import type { TurnBoundary } from './projection.js';
import { activitySummary, stringValue } from './tool-activity.js';
import type { ReaderFlowEntry, ToolActivityEntry } from './tool-activity.js';

export type LiveStep =
  | { kind: 'reasoning'; key: string; nodeKey: string; start: number; blocks: AssistantBlock[]; step: number }
  | { kind: 'body'; key: string; nodeKey: string; start: number; blocks: AssistantBlock[]; step: number }
  | { kind: 'tool'; key: string; entry: ToolActivityEntry }
  | { kind: 'user'; key: string; nodeKey: string }
  | { kind: 'other'; key: string; nodeKey: string };

export type LiveTurnItem =
  | { kind: 'user'; key: string; step: Extract<LiveStep, { kind: 'user' }> }
  | { kind: 'fold'; key: string; steps: readonly LiveStep[]; summary: string; named?: boolean }
  | { kind: 'open'; key: string; step: LiveStep };

export function liveFoldEnabled(boundary: TurnBoundary): boolean {
  return boundary.status === 'open';
}

/**
 * A finished turn still has to honour the fold switches.
 *
 * `liveFoldEnabled` gates the animated live path, which only exists while the
 * turn is open. Once it closes the reader falls back to `ClosedProcessSummary`
 * — a single whole-turn disclosure — so a reader who turned on "keep the
 * model's replies" at level 1 saw every finished turn collapse into one row
 * again, and turning auto-fold off expanded all of it. The two switches looked
 * broken on exactly the turns people actually read.
 *
 * The segmentation itself is the same either way, so reuse the live items.
 */
export function settledFoldItems(
  steps: readonly LiveStep[],
  boundary: TurnBoundary,
  keepProse: boolean,
  keepToolSemantics = false,
): LiveTurnItem[] | null {
  // Either opt-in switch means the finished turn should reuse the same
  // per-run segmentation: naming the tools requires the digest to match the run
  // it describes, exactly as much as keeping the prose does.
  if ((!keepProse && !keepToolSemantics) || boundary.status === 'open') return null;
  // Must never bail out to null for a finished turn: the caller then falls back
  // to the live items, and `liveFoldEnabled` is false once a turn closes — so
  // every step is emitted open and the whole transcript unfolds. Segmenting is
  // what folds the process while leaving the prose; small turns get exactly one
  // digest out of it, which is the same shape the author's own summary had.
  return presentLiveTurn(steps, { ...boundary, status: 'open' }, true, true, keepToolSemantics, true);
}

export function foldSummary(steps: readonly LiveStep[]): string {
  let reasoning = 0;
  let body = 0;
  let tool = 0;
  let extra = 0;
  for (const step of steps) {
    if (step.kind === 'reasoning') reasoning += 1;
    else if (step.kind === 'body') body += 1;
    else if (step.kind === 'tool') tool += 1;
    else if (step.kind !== 'user') extra += 1;
  }
  const parts: string[] = [];
  if (reasoning) parts.push(`思考×${reasoning}`);
  if (body) parts.push(`输出×${body}`);
  if (tool) parts.push(`工具×${tool}`);
  if (extra) parts.push(`记录×${extra}`);
  return parts.join(' · ') || '此前步骤';
}

/**
 * The tools a folded run actually ran, named as the tool cards name them.
 *
 * `foldSummary` only counts (`工具×22`), which tells a reader how much was
 * hidden but not what it was. This is the opt-in alternative: the same
 * identity the tool card uses, so a digest cannot claim something the card
 * does not show. Bounded to a few entries so the row stays one line.
 */
/** First line only, then clipped — a command's arguments are not a summary. */
function clipTarget(value: string, max = 32): string {
  const firstLine = value.split(/\r?\n/u)[0]!.trim();
  return firstLine.length <= max ? firstLine : `${firstLine.slice(0, max)}…`;
}

export function foldToolSemantics(steps: readonly LiveStep[], limit = 3): string {
  const named: string[] = [];
  for (const step of steps) {
    if (step.kind !== 'tool') continue;
    const model = activitySummary(step.entry);
    // `target` falls back to the whole command for terminal tools, so it has to
    // be bounded here. Unbounded, a digest quoted entire shell pipelines and
    // the row grew to hundreds of characters — which is what made the layout
    // look broken long before any width rule ran.
    const bounded = model.target ? clipTarget(model.target) : '';
    const label = bounded ? `${model.title} · ${bounded}` : model.title;
    if (label && named.at(-1) !== label) named.push(label);
  }
  if (!named.length) return '';
  const shown = named.slice(0, limit);
  const rest = named.length - shown.length;
  return rest > 0 ? `${shown.join(' · ')} 等 ${named.length} 项` : shown.join(' · ');
}

export type ChainSegment = { fold: readonly LiveStep[] | null; open: readonly LiveStep[] };

/**
 * Keep-prose split: fold each *finished* run of process steps while every body
 * step — the model's user-facing answer text — stays open.
 *
 * A run is folded only once a body step follows it, so the run that is still
 * streaming stays expanded exactly as the reader is watching it.
 *
 * Runs of a single step are left open on purpose. One tool row already reads as
 * one line, and that line carries the tool name and its target; replacing it
 * with a count would drop the only part of it a reader can act on.
 */
export function splitChainKeepingBody(chain: readonly LiveStep[], sealed = false): ChainSegment[] {
  // `sealed` is for a finished turn: nothing is streaming any more, so the
  // trailing run is no longer "what the reader is watching arrive" and may be
  // folded like any other. Without it a settled turn kept its last thinking run
  // wide open — the process folded everywhere except the tail.
  const segments: ChainSegment[] = [];
  let run: LiveStep[] = [];
  const flushRun = (finished: boolean) => {
    if (!run.length) return;
    // A finished run is worth folding when it hides more than it tells. A lone
    // reasoning step is a whole block of thinking and has to fold; a lone tool
    // row already reads as one line that carries its own name and target, so
    // folding it would only trade that line for a count. Judge by content —
    // the old length-only rule left every isolated thought box wide open.
    const worthFolding = run.length > 1 || run.some(step => step.kind !== 'tool');
    if (finished && worthFolding) segments.push({ fold: run, open: [] });
    else segments.push({ fold: null, open: run });
    run = [];
  };
  for (const step of chain) {
    if (step.kind === 'body') {
      flushRun(true);
      segments.push({ fold: null, open: [step] });
    } else if (step.kind === 'user') {
      flushRun(false);
      segments.push({ fold: null, open: [step] });
    } else if (step.kind === 'reasoning') {
      // A new reasoning step is the author's own auto-fold trigger: everything
      // before it has finished. Without this the splitter only ever flushed on
      // a body step, and a streaming turn that alternates thinking and tools
      // with no answer text yet never folded past its first run.
      flushRun(true);
      run.push(step);
    } else {
      run.push(step);
    }
  }
  // A unit runs from one thought up to — not including — the next one. The
  // trailing run is therefore still open by definition: more tools, and more
  // thoughts, may still arrive inside it. Folding it the moment a tool showed
  // up collapsed the block the reader was still watching. Only the next
  // reasoning step (or the end of the turn) closes a unit.
  flushRun(sealed);
  return segments;
}

/** One chain: fold only when a new reasoning step has prior body/tool/reasoning. */
export function splitChain(chain: readonly LiveStep[]): { fold: readonly LiveStep[] | null; open: readonly LiveStep[] } {
  const lastReasoning = chain.findLastIndex(step => step.kind === 'reasoning');
  if (lastReasoning < 0) return { fold: null, open: chain };
  const prior = chain.slice(0, lastReasoning);
  if (!prior.length) return { fold: null, open: chain };
  const trigger = prior.some(step => step.kind === 'reasoning' || step.kind === 'body' || step.kind === 'tool');
  if (!trigger) return { fold: null, open: chain };
  return { fold: prior, open: chain.slice(lastReasoning) };
}

function skipReasoning(part: { kind: string; blocks: AssistantBlock[] }): boolean {
  return part.kind === 'reasoning' && !part.blocks.some(block => block.kind === 'reasoning' && block.text.trim() !== '');
}

function skipBody(part: { kind: string; blocks: AssistantBlock[] }): boolean {
  return part.kind === 'body' && !hasVisibleBody(part.blocks);
}

function stepsFromAssistant(
  nodeKey: string,
  data: AssistantChatData,
  toolsByCallId: Map<string, ToolActivityEntry>,
  consumed: Set<string>,
): LiveStep[] {
  const marks: { at: number; step: LiveStep }[] = [];
  for (const part of assistantSegments(data.blocks)) {
    if (skipReasoning(part) || skipBody(part)) continue;
    marks.push({
      at: part.start,
      step: {
        kind: part.kind,
        key: `${nodeKey}:${part.kind}:${part.start}`,
        nodeKey,
        start: part.start,
        blocks: part.blocks,
        step: data.step,
      },
    });
  }
  data.blocks.forEach((block, index) => {
    if (block.kind !== 'tool-call' || !block.callId) return;
    const tool = toolsByCallId.get(block.callId);
    if (!tool || consumed.has(tool.callId)) return;
    consumed.add(tool.callId);
    marks.push({ at: index, step: { kind: 'tool', key: tool.key, entry: tool } });
  });
  marks.sort((left, right) => left.at - right.at || left.step.key.localeCompare(right.step.key));
  return marks.map(mark => mark.step);
}

/** Expand readerFlow into source-ordered live steps using existing block boundaries. */
export function segmentLiveTurn(
  flow: readonly ReaderFlowEntry[],
  get: (key: string) => ChatConversationViewNode | undefined,
): LiveStep[] {
  const steps: LiveStep[] = [];
  const consumed = new Set<string>();
  const toolsByCallId = new Map<string, ToolActivityEntry>();
  for (const entry of flow) {
    if (entry.kind === 'tool') toolsByCallId.set(entry.callId, entry);
  }
  for (const entry of flow) {
    if (entry.kind === 'tool') {
      if (!consumed.has(entry.callId)) {
        steps.push({ kind: 'tool', key: entry.key, entry });
        consumed.add(entry.callId);
      }
      continue;
    }
    const node = get(entry.nodeKey);
    if (!node || node.visibility === 'hidden' || node.kind === 'turn-tail') continue;
    if (node.kind === 'user' || node.kind === 'steering') {
      steps.push({ kind: 'user', key: entry.key, nodeKey: entry.nodeKey });
      continue;
    }
    if (node.kind === 'assistant-step') {
      steps.push(...stepsFromAssistant(entry.nodeKey, node.data as AssistantChatData, toolsByCallId, consumed));
      continue;
    }
    steps.push({ kind: 'other', key: entry.key, nodeKey: entry.nodeKey });
  }
  return steps;
}

/** One finished tool call, described by what it actually did. */
function toolSummary(entry: ToolActivityEntry): string {
  const info = activitySummary(entry);
  const clip = (value: string | undefined, max = 38): string | undefined => {
    if (!value) return undefined;
    const flat = value.replace(/\s+/gu, ' ').trim();
    if (!flat) return undefined;
    return flat.length > max ? flat.slice(0, max - 1) + '\u2026' : flat;
  };
  const base = info.target ? clip(info.target.split(/[/\\]/u).at(-1), 28) : undefined;
  const said = clip(stringValue(info.args, 'description'), 40);
  switch (info.category) {
    case 'read': return '读取 ' + (base ?? '文件');
    case 'write': return clip(info.title, 40) ?? '写入文件';
    case 'terminal': {
      const cmd = clip(info.command, 32);
      return said ?? (cmd ? '运行 ' + cmd : '运行命令');
    }
    case 'search': {
      const needle = clip(stringValue(info.args, 'pattern', 'query'), 26);
      return info.name === 'glob' ? '查找 ' + (needle ?? '文件') : '搜索 ' + (needle ?? '内容');
    }
    case 'web': {
      const query = clip(info.target, 30);
      return (info.name === 'web_search' ? '搜索网页' : '读取网页') + (query ? ' ' + query : '');
    }
    default: {
      // Schema-less tools (run_code and friends) describe themselves in an
      // argument rather than a known field: prefer the model's own
      // description, then the first meaningful line of the code it ran.
      if (said) return said;
      const code = stringValue(info.args, 'code', 'source', 'script');
      if (code) {
        const line = code.split('\n').map(part => part.trim())
          .find(part => part && !/^[)\]}]/.test(part) && !/^(\/\/|\*|\/\*|#)/.test(part));
        if (line) return clip(line.replace(/\s+/gu, ' '), 44) ?? '运行代码';
      }
      return clip(info.title ?? info.name, 32) ?? '工具调用';
    }
  }
}

export function presentLiveTurn(
  steps: readonly LiveStep[],
  boundary: TurnBoundary,
  autoFold = true,
  keepProse = false,
  keepToolSemantics = false,
  sealed = false,
): LiveTurnItem[] {
  const live = autoFold && liveFoldEnabled(boundary);
  const items: LiveTurnItem[] = [];
  let chain: LiveStep[] = [];
  const pushSegment = (segment: ChainSegment, fallbackKey: string) => {
    if (segment.fold?.length) {
      const named = keepToolSemantics ? foldToolSemantics(segment.fold) : '';
      items.push({
        kind: 'fold',
        key: `live-fold:${segment.fold[0]!.key ?? fallbackKey}`,
        steps: segment.fold,
        summary: named || foldSummary(segment.fold),
        // Marks the digest as tool-named so the stylesheet can widen it. The
        // author's count-only digest keeps its own geometry untouched.
        named: named !== '',
      });
    }
    for (const step of segment.open) items.push({ kind: 'open', key: step.key, step });
  };
  const flush = () => {
    if (!chain.length) return;
    if (!live) {
      for (const step of chain) items.push({ kind: 'open', key: step.key, step });
      chain = [];
      return;
    }
    // Either opt-in switch needs the per-run splitter: keeping the prose
    // requires it, and naming the tools inside a digest requires the digest to
    // line up with the run it describes. Only with both switches off does the
    // author's single-run split stay in charge — his own default behaviour.
    if (keepProse || keepToolSemantics) {
      // Fold process runs, never the model's user-facing text. See the issue:
      // a reader who does not expand the fold cannot tell whether an
      // explanation was hidden inside it.
      for (const segment of splitChainKeepingBody(chain, sealed)) pushSegment(segment, chain[0]!.key);
      chain = [];
      return;
    }
    const { fold, open } = splitChain(chain);
    if (fold?.length) {
      items.push({ kind: 'fold', key: `live-fold:${chain[0]!.key}`, steps: fold, summary: foldSummary(fold) });
    }
    for (const step of open) items.push({ kind: 'open', key: step.key, step });
    chain = [];
  };
  for (const step of steps) {
    if (step.kind === 'user') {
      flush();
      items.push({ kind: 'user', key: step.key, step });
    } else {
      chain.push(step);
    }
  }
  flush();
  return items;
}
