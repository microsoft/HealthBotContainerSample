// ----------------------------------------------------------------- wire contract

export const EventType = {
  RUN_STARTED: "RUN_STARTED",
  RUN_ERROR: "RUN_ERROR",
  TEXT_MESSAGE_CONTENT: "TEXT_MESSAGE_CONTENT",
  TOOL_CALL_START: "TOOL_CALL_START",
  TOOL_CALL_END: "TOOL_CALL_END",
  TOOL_CALL_RESULT: "TOOL_CALL_RESULT",
} as const;

export const HasEventType = {
  TOOL_CALL_STREAM: "TOOL_CALL_STREAM",
} as const;

export const ToolStreamPayloadType = {
  DELTA: "DELTA",
  CUSTOM: "CUSTOM",
} as const;

export type CoreEventType = (typeof EventType)[keyof typeof EventType];

/** HAS-specific fields the Orchestrator adds on top of the AG-UI event shape. */
export interface EventExtensions {
  /** Human-readable progress line shown to the user while a tool runs. */
  toolProgress?: string;
  /** True when this tool call is a fallback/retry of a previous one. */
  isFallback?: boolean;
  /** The tool call id this fallback replaces, so its reasoning step is updated in place. */
  replacedToolCallId?: string;
  [key: string]: unknown;
}

export interface BaseAguiEvent {
  type: string;
  timestamp?: number;
}

export interface RunStartedEvent extends BaseAguiEvent {
  type: typeof EventType.RUN_STARTED;
  threadId?: string;
  runId?: string;
}

export interface RunErrorEvent extends BaseAguiEvent {
  type: typeof EventType.RUN_ERROR;
  message?: string;
  code?: string;
}

export interface TextMessageContentEvent extends BaseAguiEvent {
  type: typeof EventType.TEXT_MESSAGE_CONTENT;
  messageId?: string;
  delta?: string;
}

export interface ToolCallStartEvent extends BaseAguiEvent {
  type: typeof EventType.TOOL_CALL_START;
  toolCallId?: string;
  toolCallName?: string;
  extensions?: EventExtensions;
}

export interface ToolCallEndEvent extends BaseAguiEvent {
  type: typeof EventType.TOOL_CALL_END;
  toolCallId?: string;
}

export interface ToolCallResultEvent extends BaseAguiEvent {
  type: typeof EventType.TOOL_CALL_RESULT;
  toolCallId?: string;
  messageId?: string;
  content?: string;
}

export interface ToolStreamDeltaPayload {
  type: typeof ToolStreamPayloadType.DELTA;
  text?: string;
}

export interface ToolStreamCustomPayload {
  type: typeof ToolStreamPayloadType.CUSTOM;
  name?: string;
  data?: unknown;
}

export type ToolStreamPayload =
  | ToolStreamDeltaPayload
  | ToolStreamCustomPayload;

export interface ToolCallStreamEvent extends BaseAguiEvent {
  type: typeof HasEventType.TOOL_CALL_STREAM;
  toolCallId?: string;
  toolCallName?: string;
  payload?: ToolStreamPayload;
}

export interface UnknownEvent extends BaseAguiEvent {
  type: string;
  [key: string]: unknown;
}

export type CoreAguiEvent =
  | RunStartedEvent
  | RunErrorEvent
  | TextMessageContentEvent
  | ToolCallStartEvent
  | ToolCallEndEvent
  | ToolCallResultEvent
  | ToolCallStreamEvent;

export type AnyAguiEvent = CoreAguiEvent | UnknownEvent;

export interface CoreEventShape {
  RUN_STARTED: RunStartedEvent;
  RUN_ERROR: RunErrorEvent;
  TEXT_MESSAGE_CONTENT: TextMessageContentEvent;
  TOOL_CALL_START: ToolCallStartEvent;
  TOOL_CALL_END: ToolCallEndEvent;
  TOOL_CALL_RESULT: ToolCallResultEvent;
  TOOL_CALL_STREAM: ToolCallStreamEvent;
}

// --------------------------------------------------------------- stream envelope

export interface StreamEnvelope {
  runId?: string;
  events: AnyAguiEvent[];
}

export interface ParsedStreamFrame {
  runId?: string;
  events: AnyAguiEvent[];
}

// ------------------------------------------------------------ event interpretation

export type EventShape = CoreEventShape;
export type KnownEventType = keyof EventShape;
export interface EventInterpretation<E> {
  /** Safe, user-visible progress line. Never returns raw tool names or arguments. */
  progressText?: (event: E) => string;
  /** Text to append to the streamed answer. */
  answerDelta?: (event: E) => string;
}

export type EventRegistry = {
  [K in KnownEventType]?: EventInterpretation<EventShape[K]>;
};

export interface EventInterpretationResult {
  progressText: string;
  answerDelta: string;
}

// ------------------------------------------------------------------- message state

export type MessageVariant = "answer" | "progress" | "error";

export type AvatarState = "listening" | "thinking" | "done";

export interface StepSource {
  /** Stable id for list rendering (custom event name + index). */
  id: string;
  /** The custom event name, e.g. "sources_found". */
  name: string;
  /** The raw structured payload, captured for later use. */
  data: unknown;
}

export interface ReasoningStep {
  /** Stable id — the tool call id when available, else a positional fallback. */
  id: string;
  /** Safe, user-visible label (never a raw tool name or arguments). */
  label: string;
  status: "active" | "done";
  /** Streamed detail content for the step (TOOL_CALL_STREAM DELTA text). */
  detail: string;
  /** Structured data captured mid-step (TOOL_CALL_STREAM CUSTOM, e.g. sources). */
  sources: StepSource[];
}

export interface MessageState {
  variant: MessageVariant;
  /** Accumulated streamed answer text. */
  answerText: string;
  /** Current human-readable progress line (Health Bot-injected; never a raw tool name). */
  progressText: string;
  reasoningSteps: ReasoningStep[];
  avatarState: AvatarState;
}

export function createInitialMessageState(): MessageState {
  return {
    variant: "progress",
    answerText: "",
    progressText: "",
    reasoningSteps: [],
    avatarState: "listening",
  };
}

export interface ReduceResult {
  state: MessageState;
  /** Text this event contributes to the streamed answer, if any. */
  answerDelta: string;
}
