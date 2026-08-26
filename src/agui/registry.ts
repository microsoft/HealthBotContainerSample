/*
 * Typed AG-UI event interpretation registry.
 *
 * This is the ONE place a developer teaches the streaming UI to act on an event.
 * Each entry maps an event type to how the controller should interpret it:
 *
 *   - progressText(event) -> a safe, user-visible progress line (or '')
 *   - answerDelta(event)  -> text to append to the streamed answer (or '')
 *   - category            -> documentation-only grouping
 *
 * The registry is fully typed: because it is keyed by event-type name, each handler
 * receives the correctly-narrowed event interface — no per-entry casts, no `switch`
 * sprawl. It holds only entries for events the sample actually reacts to.
 *
 * SAFE DEFAULT (forward compatibility): any event NOT in the registry is logged once
 * to the dev console and ignored. It never throws and never disrupts streaming. This
 * is what lets the Orchestrator team add events upstream in parallel while this sample
 * keeps working — we model an event only when it needs a behaviour.
 *
 * The registry holds NO lifecycle/animation logic (typing, reveal, bubble expiry,
 * directive selection). That stays in the controller (streaming.ts). The registry
 * answers only "what does this event mean?", never "what should the UI do next?".
 */

import { EventType } from './events.ts';
import type { CoreAguiEvent, CoreEventShape, UnknownEvent } from './events.ts';
import type { MessageState, ReasoningStep } from './messageState.ts';

/** Every event the controller may see: modelled events + the permissive fallback. */
export type AnyAguiEvent = CoreAguiEvent | UnknownEvent;

/** Type-name -> concrete-interface map for the modelled events. */
export type EventShape = CoreEventShape;

/** The set of event type names that have a registry entry. */
export type KnownEventType = keyof EventShape;

/** Documentation-only grouping to help future readers scan the registry. */
export type EventCategory = 'lifecycle' | 'progress' | 'answer';

/** How to interpret one event type. Handlers are pure and side-effect free. */
export interface EventInterpretation<E> {
  category: EventCategory;
  /** Safe, user-visible progress line. Never returns raw tool names or arguments. */
  progressText?: (event: E) => string;
  /** Text to append to the streamed answer. */
  answerDelta?: (event: E) => string;
}

/** The registry type: an optional, correctly-typed interpretation per event name. */
export type EventRegistry = {
  [K in KnownEventType]?: EventInterpretation<EventShape[K]>;
};

/**
 * The interpretation registry — one entry per event the sample reacts to.
 * (RUN_ERROR needs no entry: its lifecycle is handled directly by the controller
 * before interpretation, so it never reaches interpretEvent.)
 */
const registry: EventRegistry = {
  [EventType.RUN_STARTED]: {
    category: 'lifecycle',
    progressText: () => 'Evaluating your request',
  },
  [EventType.TOOL_CALL_START]: {
    category: 'progress',
    // Only the Health Bot-injected, human-readable progress line is ever shown.
    // Raw tool names and arguments are never surfaced.
    progressText: (event) =>
      typeof event.extensions?.toolProgress === 'string'
        ? event.extensions.toolProgress
        : '',
  },
  [EventType.TEXT_MESSAGE_CONTENT]: {
    category: 'answer',
    answerDelta: (event) => (typeof event.delta === 'string' ? event.delta : ''),
  },
};

/** The result of interpreting a single event. */
export interface EventInterpretationResult {
  progressText: string;
  answerDelta: string;
}

const EMPTY_INTERPRETATION: EventInterpretationResult = {
  progressText: '',
  answerDelta: '',
};

// Remember which unknown event types we have already logged, so a repeated unknown
// event does not spam the console. Purely a dev-experience concern.
const warnedUnknownTypes = new Set<string>();

/** Safe default: log an unmodelled event once, then ignore it. Never throws. */
function warnUnknownEvent(type: string): void {
  if (warnedUnknownTypes.has(type)) {
    return;
  }
  warnedUnknownTypes.add(type);
  // eslint-disable-next-line no-console
  console.debug(
    `[agui] Ignoring unrecognised event type "${type}". ` +
      'Add an entry to src/agui/registry.ts to interpret it.',
  );
}

/**
 * Interpret one AG-UI event into progress/answer text. Unknown events fall through
 * to the safe default (logged once, ignored) and yield empty strings — never throws.
 */
export function interpretEvent(event: AnyAguiEvent): EventInterpretationResult {
  const type = event.type;
  // Single controlled cast: we looked the entry up by the event's runtime type, so
  // its handlers accept exactly this event. Widened to AnyAguiEvent for the call.
  const entry = registry[type as KnownEventType] as
    | EventInterpretation<AnyAguiEvent>
    | undefined;

  if (!entry) {
    warnUnknownEvent(type);
    return EMPTY_INTERPRETATION;
  }

  return {
    progressText: entry.progressText ? entry.progressText(event) : '',
    answerDelta: entry.answerDelta ? entry.answerDelta(event) : '',
  };
}

/*
 * Structured reduction — the AG-UI-aligned upgrade of the flat-string path above.
 *
 * `interpretEvent` answers "what text does this event carry?"; `reduceEvent` answers
 * "how does this event evolve the message view-model?". It is the single place that
 * maps an event onto MessageState, keeping the "one place to teach the UI about an
 * event" philosophy that registry.ts already embodies.
 *
 * It is PURE: (prevState, event) -> nextState, returning a new object on change and the
 * SAME reference when nothing changed (so external-store subscribers don't re-render
 * needlessly). It reuses interpretEvent internally so answer/progress text has exactly
 * one source of truth. Unknown events fall through unchanged — the same forward-
 * compatible safe default as the text path.
 */

/** Derive a stable id for a reasoning step: the tool call id, else a positional key. */
function reasoningStepId(event: { toolCallId?: string }, index: number): string {
  return typeof event.toolCallId === 'string' && event.toolCallId
    ? event.toolCallId
    : `step-${index}`;
}

/**
 * Settle any in-progress reasoning steps to 'done'. Returns the SAME array reference when
 * nothing is active, so callers preserve the snapshot-stability contract (no needless
 * re-render / store notify) when there is nothing to change.
 */
function markStepsDone(steps: ReasoningStep[]): ReasoningStep[] {
  if (!steps.some((step) => step.status === 'active')) {
    return steps;
  }
  return steps.map((step) => (step.status === 'active' ? { ...step, status: 'done' } : step));
}

/**
 * Fold one AG-UI event into the message view-model. Returns `prev` unchanged for events
 * that carry no structural meaning (including unknown/future events), so the external
 * store can skip notifying subscribers.
 */
export function reduceEvent(prev: MessageState, event: AnyAguiEvent): MessageState {
  const { progressText, answerDelta } = interpretEvent(event);

  switch (event.type) {
    case EventType.RUN_STARTED: {
      const label = progressText || prev.progressText;
      // Seed the opening line ("Evaluating your request") as the first reasoning step so
      // it appears in the trace, not only on the live rail. Seed once (empty trace).
      const reasoningSteps =
        prev.reasoningSteps.length === 0 && label
          ? [{ id: 'run-start', label, status: 'active' as const }]
          : prev.reasoningSteps;
      return {
        ...prev,
        variant: prev.answerText ? 'answer' : 'progress',
        avatarState: 'thinking',
        progressText: label,
        reasoningSteps,
      };
    }

    case EventType.RUN_ERROR:
      return { ...prev, variant: 'error', avatarState: 'done', reasoningSteps: markStepsDone(prev.reasoningSteps) };

    case EventType.TOOL_CALL_START: {
      const label = progressText || prev.progressText;
      const step: ReasoningStep = {
        id: reasoningStepId(event as { toolCallId?: string }, prev.reasoningSteps.length),
        label,
        status: 'active',
      };
      // A new step starting means the previous one has finished: settle prior active
      // steps to 'done' before appending, so a completed trace (F1 history above the
      // answer) reads as done rather than perpetually in-progress.
      return {
        ...prev,
        variant: prev.answerText ? 'answer' : 'progress',
        avatarState: 'thinking',
        progressText: progressText || prev.progressText,
        reasoningSteps: [...markStepsDone(prev.reasoningSteps), step],
      };
    }

    case EventType.TEXT_MESSAGE_CONTENT:
      if (!answerDelta) {
        return prev;
      }
      // The answer has started streaming — reasoning is over, so settle all steps to
      // 'done'. markStepsDone returns the same array reference once nothing is active,
      // so subsequent deltas only grow answerText (snapshot stability preserved).
      return {
        ...prev,
        variant: 'answer',
        avatarState: 'thinking',
        answerText: prev.answerText + answerDelta,
        reasoningSteps: markStepsDone(prev.reasoningSteps),
      };

    default:
      // Unknown / future events carry no structural meaning yet — leave state as-is.
      return prev;
  }
}
