import { EventType, HasEventType } from "./models";
import type {
  AnyAguiEvent,
  EventInterpretation,
  EventInterpretationResult,
  EventRegistry,
  KnownEventType,
} from "./models";

const registry: EventRegistry = {
  [EventType.RUN_STARTED]: {
    progressText: () => "Evaluating your request",
  },
  [EventType.TOOL_CALL_START]: {
    progressText: (event) =>
      typeof event.extensions?.toolProgress === "string"
        ? event.extensions.toolProgress
        : "",
  },
  [EventType.TEXT_MESSAGE_CONTENT]: {
    answerDelta: (event) =>
      typeof event.delta === "string" ? event.delta : "",
  },
};

const EMPTY_INTERPRETATION: EventInterpretationResult = {
  progressText: "",
  answerDelta: "",
};

const warnedUnknownTypes = new Set<string>();

// Unknown events are logged once and ignored so the Orchestrator can add events upstream safely.
function warnUnknownEvent(type: string): void {
  if (warnedUnknownTypes.has(type)) {
    return;
  }
  warnedUnknownTypes.add(type);
  console.debug(
    `[agui] Ignoring unrecognised event type "${type}". ` +
      "Add an entry to src/reducer/interpret.ts to interpret it."
  );
}

export function interpretEvent(event: AnyAguiEvent): EventInterpretationResult {
  const type = event.type;
  const entry = registry[type as KnownEventType] as
    | EventInterpretation<AnyAguiEvent>
    | undefined;

  if (!entry) {
    if (!isModelledType(type)) {
      warnUnknownEvent(type);
    }
    return EMPTY_INTERPRETATION;
  }

  return {
    progressText: entry.progressText ? entry.progressText(event) : "",
    answerDelta: entry.answerDelta ? entry.answerDelta(event) : "",
  };
}

const modelledTypes = new Set<string>([
  ...Object.values(EventType),
  ...Object.values(HasEventType),
]);

function isModelledType(type: string): boolean {
  return modelledTypes.has(type);
}
