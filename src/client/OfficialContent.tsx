import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { AssistantActionOwnerProps, ChatConversationViewNode, ChatNode, ChatNodeOwnerProps, TurnTailOwnerProps, UseDisclosure } from '@deepseek-ai/dsh-client-ui-chat/client';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { AssistantBlock, ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
type MessageId = AssistantActionOwnerProps['messageId'];
import { OFFICIAL_SEATS, readerGroupAction } from './official-slots.js';
import type { BlockRenderProps } from './types.js';
import { chatSeatProps } from './chat-seat.js';
import { Blocks } from './Blocks.js';

export function OfficialActions({ official, messageId }: Pick<BlockRenderProps, 'official'> & { messageId?: MessageId }) {
  if (!official || !messageId) return null;
  return <span data-reader-official-actions style={{ display: 'contents' }}>
    {official.renderSlot(OFFICIAL_SEATS.actions, { messageId })}
  </span>;
}

/** Each atomic Tool view owns its disclosure state through this stable Hook prop. */
const useToolDisclosure: UseDisclosure = () => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded(previous => !previous), []);
  return { expanded, setExpanded, toggle };
};

export function OfficialTool({ official, block, toolName, cwd, openFile, fallback }: BlockRenderProps & {
  official: NonNullable<BlockRenderProps['official']>; block: ToolCallBlock; toolName: string; fallback: ReactNode;
}) {
  const home = useSyncExternalStore(official.officialHost.subscribe, official.officialHost.getSnapshot).home;
  return <div data-reader-tool-official>
    {(official.renderSlot as (key: string, owner: object, options: object) => ReactNode)(OFFICIAL_SEATS.tools, {
      callId: block.callId, toolName,
      phase: 'kind' in block ? 'result' : block.phase, block, cwd, home,
      openFile: openFile ?? (() => {}),
      loadImage: official.officialImageLoader,
      useDisclosure: useToolDisclosure,
      inspect: () => official.openView('trajectory', block.callId),
    }, { entryKey: toolName, hookContext: { callId: block.callId, assistant: undefined }, fallback })}
  </div>;
}

function chatNodeOwner(render: BlockRenderProps, official: NonNullable<BlockRenderProps['official']>): ChatNodeOwnerProps {
  return {
    cwd: render.cwd,
    openFile: render.openFile ?? (() => {}),
    forkAt: render.forkAt ?? (() => {}),
    inspectCall: callId => official.openView('trajectory', callId),
    loadImage: official.officialImageLoader,
    fileMentions: official.officialFileMentions,
  };
}

function nodeHookContext(turnData: unknown, disclosureReset: ReturnType<typeof createSnapshotStore<number>>) {
  return { turnData, disclosureReset, useGroupAction: readerGroupAction };
}

export function OfficialNode({ node, fallback, ...render }: BlockRenderProps & { node: ChatConversationViewNode; fallback: ReactNode }) {
  const official = render.official;
  const [disclosureReset] = useState(() => createSnapshotStore(0));
  if (!official) return fallback;
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  // The runtime node domain is open; the public SlotMap enumerates the known kinds.
  const renderNode = official.renderSlot as unknown as (key: string, owner: object, options: object) => ReactNode;
  return <div data-reader-official-node={node.kind} {...(node.kind === 'user' || node.kind === 'steering' ? chatSeatProps(node.kind, node.key) : {})}>
    {renderNode(OFFICIAL_SEATS.nodes, { ...chatNodeOwner(render, official), node }, { entryKey: node.kind, hookContext: nodeHookContext(turn?.data, disclosureReset), fallback })}
  </div>;
}

type AssistantBodyProps = BlockRenderProps & {
  node: ChatNode<'assistant-step'>;
  blocks: readonly AssistantBlock[];
  streaming?: boolean;
  holdFormatting?: boolean;
  startedAt?: number;
  interrupted?: boolean;
  liveText?: boolean;
};

/**
 * Body of one assistant segment. A mirrored assistant-step replacement draws
 * it; Reader markdown is the fallback when no replacement is registered.
 * The caller keeps reasoning blocks on the reading card.
 */
export function OfficialAssistantBody({
  node, blocks, streaming = false, holdFormatting = false, startedAt, interrupted = false, liveText = false, ...render
}: AssistantBodyProps) {
  const official = render.official;
  const [disclosureReset] = useState(() => createSnapshotStore(0));
  const fallback = <Blocks {...render} blocks={blocks} streaming={streaming} holdFormatting={holdFormatting} startedAt={startedAt} interrupted={interrupted} liveText={liveText} />;
  if (!official) return fallback;
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  const sameBlocks = blocks.length === node.data.blocks.length && blocks.every((block, index) => block === node.data.blocks[index]);
  const view = sameBlocks ? node : { ...node, data: { ...node.data, blocks } };
  const renderNode = official.renderSlot as unknown as (key: string, owner: object, options: object) => ReactNode;
  // groupPart matches the host split: response skips reasoning. The block
  // slice is what a replacement that ignores groupPart actually receives.
  return renderNode(OFFICIAL_SEATS.nodes, { ...chatNodeOwner(render, official), node: view, groupPart: 'response' }, {
    entryKey: 'assistant-step',
    hookContext: nodeHookContext(turn?.data, disclosureReset),
    fallback,
  });
}

export function OfficialTail({ official, owner, produced }: Pick<BlockRenderProps, 'official'> & { owner?: TurnTailOwnerProps; produced: readonly string[] }) {
  const tailOwner = owner && official ? { ...owner, openFile: official.officialPreviewFile, readerProducedPaths: produced } : undefined;
  return official && tailOwner ? <div data-reader-official-tail style={{ display: 'contents' }}>
    {official.renderSlot(OFFICIAL_SEATS.tail, tailOwner)}
  </div> : null;
}
