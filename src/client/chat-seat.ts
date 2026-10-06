export type ChatSeatKind = 'user' | 'steering';

export function chatSeatProps(kind: ChatSeatKind, key: string): Record<string, string> {
  return {
    'data-chat-anchor-key': key,
    'data-chat-flow-key': key,
    'data-chat-node-key': key,
    'data-chat-flow-kind': kind,
  };
}
