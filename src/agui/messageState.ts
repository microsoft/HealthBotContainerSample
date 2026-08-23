/*
 * MessageState — the structured view-model for one streamed bot message.
 *
 * This is the client-side state object the AG-UI protocol expects a frontend to hold
 * and evolve as events arrive (the protocol even ships STATE_SNAPSHOT / STATE_DELTA
 * events for exactly this shape). HealthBot's Orchestrator streams *content* events
 * rather than state deltas, so we DERIVE this state on the client with a pure reducer
 * (see reduceEvent in registry.ts) instead of receiving it wholesale.
 *
 * It is a DTO: plain, typed data with no behaviour. The streaming controller fills it;
 * React components (src/chat/Message.tsx) render it declaratively. One shared contract
 * means every redesign feature reads/writes the same object instead of inventing its
 * own ad-hoc shape.
 *
 * Every field has a concrete default (see createInitialMessageState) so the view never
 * has to null-check: an empty answer is '', no citations is [], etc. Fields are filled
 * incrementally as features land — the shape is defined up front, the data grows.
 *
 * This module is intentionally framework-free (no React, no DOM) so it can be imported
 * by the framework-free streaming controller and by the React layer alike.
 */

/** Which structural card a message renders as. Drives the <Message> variant switch. */
export type MessageVariant = 'answer' | 'progress' | 'error' | 'location';

/** The agent's presence state, surfaced later as avatar micro-expressions (W3). */
export type AvatarState = 'listening' | 'thinking' | 'done';

/** One step in the agent's reasoning/tool timeline (feeds A1 chip / F1 history / F2 rail). */
export interface ReasoningStep {
  /** Stable id — the tool call id when available, else a positional fallback. */
  id: string;
  /** Safe, user-visible label (never a raw tool name or arguments). */
  label: string;
  status: 'active' | 'done';
}

/** A grounding source for the answer (feeds B5 citation chips / Y1 anchored citations). */
export interface Citation {
  id: string;
  title?: string;
  url?: string;
}

/**
 * The full view-model for a single streamed message. Concrete (non-optional) fields
 * with sensible defaults keep the render layer null-check free; features populate the
 * richer fields (reasoningSteps, citations, avatarState) as they are built.
 */
export interface MessageState {
  variant: MessageVariant;
  /** Accumulated streamed answer text. */
  answerText: string;
  /** Current human-readable progress line (Health Bot-injected; never a raw tool name). */
  progressText: string;
  reasoningSteps: ReasoningStep[];
  citations: Citation[];
  avatarState: AvatarState;
}

/** A fresh, empty message state. Every reducer transition starts from one of these. */
export function createInitialMessageState(): MessageState {
  return {
    variant: 'progress',
    answerText: '',
    progressText: '',
    reasoningSteps: [],
    citations: [],
    avatarState: 'listening',
  };
}
