import { useCallback, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { ChatConversationViewNode, ChatNodeOwnerProps, TurnTailOwnerProps, UseDisclosure } from '@deepseek-ai/dsh-client-ui-chat/client';
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store';
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { AssistantActionOwnerProps } from '@deepseek-ai/dsh-client-ui-chat/client';
type MessageId = AssistantActionOwnerProps['messageId'];
import { OFFICIAL_SEATS } from './official-slots.js';
import type { BlockRenderProps } from './types.js';

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

export function OfficialNode({ node, fallback, ...render }: BlockRenderProps & { node: ChatConversationViewNode; fallback: ReactNode }) {
  const official = render.official;
  const [disclosureReset] = useState(() => createSnapshotStore(0));
  if (!official) return fallback;
  const owner: ChatNodeOwnerProps = {
    cwd: render.cwd,
    openFile: render.openFile ?? (() => {}),
    openSkill: () => {},
    forkAt: render.forkAt ?? (() => {}),
    inspectCall: callId => official.openView('trajectory', callId),
    loadImage: official.officialImageLoader,
    renderMessageImages: images => official.renderSlot(OFFICIAL_SEATS.images, {
      ...images, loadImage: official.officialImageLoader,
    }),
    fileMentions: official.officialFileMentions,
  };
  const turn = node.location.kind === 'turn' || node.location.kind === 'step' ? node.location.turn : undefined;
  // The runtime node domain is open; the public SlotMap enumerates the known kinds.
  const renderNode = official.renderSlot as unknown as (key: string, owner: object, options: object) => ReactNode;
  return <div data-reader-official-node={node.kind} data-chat-anchor-key={node.key} data-chat-flow-kind={node.kind}>
    {renderNode(OFFICIAL_SEATS.nodes, { ...owner, node }, { entryKey: node.kind, hookContext: { turnData: turn?.data, disclosureReset }, fallback })}
  </div>;
}

export function OfficialTail({ official, owner, produced }: Pick<BlockRenderProps, 'official'> & { owner?: TurnTailOwnerProps; produced: readonly string[] }) {
  const tailOwner = owner && official ? { ...owner, openFile: official.officialPreviewFile, readerProducedPaths: produced } : undefined;
  return official && tailOwner ? <div data-reader-official-tail style={{ display: 'contents' }}>
    {official.renderSlot(OFFICIAL_SEATS.tail, tailOwner)}
  </div> : null;
}
