import { useLayoutEffect } from 'react';
import type { Context } from '@deepseek-ai/cordis';
import type { ChatStore } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { PropsRuntime, PropsStore, StoreDecl } from '@deepseek-ai/dsh-client-ui-slots';
import { ReaderEntryPolicy, readerEntryRequested } from './entry-policy.js';

function isChatStore(store: StoreDecl | undefined): store is ChatStore {
  return typeof store === 'object' && store !== null
    && store.spec.persist === 'dsh.conversation.chat'
    && typeof store.spec.actions.setView === 'function';
}

type EntryProps = PropsRuntime<'conversation.input.dock'> & PropsStore<ChatStore> & { policy: ReaderEntryPolicy };

function ReaderEntry({ useStore, actions, policy }: EntryProps) {
  const view = useStore(state => state.view);
  useLayoutEffect(() => {
    const next = policy.select(view);
    if (next) actions.setView(next);
  }, [view, actions, policy]);
  return null;
}

/** Reuse the native store handle; its framework-owned instance preserves drafts. */
export function installReaderEntry(ctx: Context): () => void {
  const native = ctx.slots.entriesOfSlot('conversation.session')[0]?.store;
  if (!isChatStore(native)) throw new Error('DSH Reader cannot bind the native conversation view store.');
  const policy = new ReaderEntryPolicy(readerEntryRequested(location.search), () => {
    const url = new URL(location.href);
    url.searchParams.delete('reader');
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  });
  return ctx.slots.register({
    name: 'conversation.input.dock',
    id: 'dsh-better-display-entry',
    store: native,
    inject: () => ({ policy }),
  }, ReaderEntry);
}
