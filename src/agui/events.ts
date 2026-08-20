/*
 * Vendored AG-UI core event types.
 *
 * The Health Bot Orchestrator speaks the AG-UI protocol (https://ag-ui.com). Each
 * event is forwarded to the browser inside a Direct Line message envelope
 * (see parseEnvelope.ts) and interpreted by the streaming controller.
 *
 * Why vendored (not the `@ag-ui/core` npm package)?
 *   At the time of writing that package only ships a `0.1.1-canary` pre-release,
 *   too unstable to depend on from a customer-facing sample.
 *
 * SCOPE — we model ONLY the events this sample actually acts on. Every other event
 * (present or future) is handled by the safe default in registry.ts: logged once and
 * ignored, never a crash. So this list stays intentionally tiny; to make the sample
 * react to a new event, add it here + one registry entry (see the dev guide).
 *
 * Field casing: every event field is camelCase (confirmed against a real captured
 * Direct Line trace — Health Bot converts the Orchestrator's Python snake_case).
 */

import type { EventExtensions } from './extensions.ts';

/**
 * The AG-UI event type names this sample acts on. Values equal their keys so the
 * object doubles as the string-literal source of truth (avoids a TS `enum`, which
 * Node's type-stripping test loader does not support).
 */
export const EventType = {
  RUN_STARTED: 'RUN_STARTED',
  RUN_ERROR: 'RUN_ERROR',
  TEXT_MESSAGE_CONTENT: 'TEXT_MESSAGE_CONTENT',
  TOOL_CALL_START: 'TOOL_CALL_START',
} as const;

/** Union of the modelled event type names (e.g. 'RUN_STARTED'). */
export type CoreEventType = (typeof EventType)[keyof typeof EventType];

/** Fields shared by every AG-UI event. */
export interface BaseAguiEvent {
  type: string;
  timestamp?: number;
}

/** Start of an Orchestrator run. Drives the initial "Evaluating your request" line. */
export interface RunStartedEvent extends BaseAguiEvent {
  type: typeof EventType.RUN_STARTED;
  threadId?: string;
  runId?: string;
}

/** A run failed. The controller retires the progress bubble for the final message. */
export interface RunErrorEvent extends BaseAguiEvent {
  type: typeof EventType.RUN_ERROR;
  message?: string;
  code?: string;
}

/** A chunk of the streamed answer text. */
export interface TextMessageContentEvent extends BaseAguiEvent {
  type: typeof EventType.TEXT_MESSAGE_CONTENT;
  messageId?: string;
  delta?: string;
}

/** A tool started. `extensions.toolProgress` carries the user-visible progress line. */
export interface ToolCallStartEvent extends BaseAguiEvent {
  type: typeof EventType.TOOL_CALL_START;
  toolCallId?: string;
  toolCallName?: string;
  extensions?: EventExtensions;
}

/**
 * Forward-compatible fallback for any event type this sample does not model. Keeping
 * it in the union is deliberate: the Orchestrator can add events upstream without
 * breaking this client (see registry.ts's safe default).
 */
export interface UnknownEvent extends BaseAguiEvent {
  type: string;
  [key: string]: unknown;
}

/** Discriminated union of the events this sample models. */
export type CoreAguiEvent =
  | RunStartedEvent
  | RunErrorEvent
  | TextMessageContentEvent
  | ToolCallStartEvent;

/**
 * Maps each modelled event type name to its interface, so registry handlers receive
 * a correctly-narrowed event with zero manual casts.
 */
export interface CoreEventShape {
  RUN_STARTED: RunStartedEvent;
  RUN_ERROR: RunErrorEvent;
  TEXT_MESSAGE_CONTENT: TextMessageContentEvent;
  TOOL_CALL_START: ToolCallStartEvent;
}
