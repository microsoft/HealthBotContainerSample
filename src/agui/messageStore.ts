/*
 * messageStore — the external store that holds MessageState outside React.
 *
 * Streaming state is produced imperatively by the AG-UI controller (src/streaming.ts)
 * as Direct Line events arrive through Web Chat's Redux middleware — i.e. OUTSIDE
 * React's own render cycle. This module is the single source of truth for that state:
 * the controller writes to it (applyEvent), React subscribes to it via
 * useSyncExternalStore (src/chat/useMessageState.ts). This is the canonical
 * external-store pattern and keeps the controller framework-free (no React import here).
 *
 * Keyed by the streaming activity id (streamProgressId, e.g. "has-stream-progress-0"),
 * so each temporary bubble has its own state and the same id joins writer and reader.
 *
 * Snapshot stability contract (required by useSyncExternalStore): getSnapshot(id)
 * returns the SAME object reference until that entry actually changes. reduceEvent
 * returns `prev` unchanged for no-op events, so we only replace the stored reference —
 * and only then notify — when the state genuinely changed. This prevents render loops.
 */

import type { MessageState } from './messageState.ts';
import { createInitialMessageState } from './messageState.ts';
import { reduceEvent } from './registry.ts';
import type { AnyAguiEvent } from './registry.ts';

type Listener = () => void;

export interface MessageStore {
  /** Subscribe to any change; returns an unsubscribe fn. (useSyncExternalStore contract.) */
  subscribe(listener: Listener): () => void;
  /** Current state for an id, or undefined if this id has no state yet. Stable reference. */
  getSnapshot(id: string): MessageState | undefined;
  /** Fold an AG-UI event into the state for `id`. Notifies only on a real change. */
  applyEvent(id: string, event: AnyAguiEvent): MessageState;
  /** Drop the state for `id` (called when a new turn retires the previous bubble). */
  reset(id: string): void;
  /** Drop all state (test/gallery isolation). */
  clear(): void;
}

export function createMessageStore(): MessageStore {
  const states = new Map<string, MessageState>();
  const listeners = new Set<Listener>();

  function emit(): void {
    listeners.forEach((listener) => listener());
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    getSnapshot(id) {
      return states.get(id);
    },

    applyEvent(id, event) {
      const prev = states.get(id) ?? createInitialMessageState();
      const next = reduceEvent(prev, event);
      // reduceEvent returns the same reference when nothing changed; treat a brand-new
      // id (prev not yet stored) as a change so the first event registers state.
      if (next === prev && states.has(id)) {
        return prev;
      }
      states.set(id, next);
      emit();
      return next;
    },

    reset(id) {
      if (states.delete(id)) {
        emit();
      }
    },

    clear() {
      if (states.size > 0) {
        states.clear();
        emit();
      }
    },
  };
}

/**
 * The app-wide singleton. The streaming controller and the React layer share this one
 * instance (like a Redux store). Tests and the component gallery create isolated
 * instances via createMessageStore() instead.
 */
export const messageStore: MessageStore = createMessageStore();
