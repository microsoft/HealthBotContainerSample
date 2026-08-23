/*
 * useMessageState — the React bridge to the external messageStore.
 *
 * MessageState lives OUTSIDE React (it is produced imperatively by the streaming
 * controller as AG-UI events arrive through Web Chat middleware). useSyncExternalStore
 * is React's official, tear-free way to subscribe a component to exactly this kind of
 * external source: give it a `subscribe` and a `getSnapshot` and React re-renders the
 * component whenever the store notifies a change.
 *
 * React 17 predates the built-in hook, so we use React's own backport,
 * `use-sync-external-store/shim` (maintained by the React team). It resolves to the
 * native hook on React 18+ and to a correct polyfill on 17 — same semantics either way.
 *
 * The store guarantees a stable snapshot reference between changes (see messageStore.ts),
 * which is what keeps useSyncExternalStore from looping.
 */

import { useCallback } from 'react';
import { useSyncExternalStore } from 'use-sync-external-store/shim';
import type { MessageState } from '../agui/messageState';
import { messageStore } from '../agui/messageStore';
import type { MessageStore } from '../agui/messageStore';

/**
 * Subscribe a component to the MessageState for a given streaming activity id.
 * Returns `undefined` until the first event for that id arrives.
 *
 * @param id    the streaming activity id (streamProgressId, e.g. "has-stream-progress-0")
 * @param store the store to read from; defaults to the app-wide singleton. Injectable
 *              so the component gallery and tests can supply an isolated instance.
 */
export function useMessageState(
  id: string,
  store: MessageStore = messageStore,
): MessageState | undefined {
  const getSnapshot = useCallback(() => store.getSnapshot(id), [store, id]);
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
