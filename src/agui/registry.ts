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
