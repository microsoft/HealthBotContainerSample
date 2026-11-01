import { EventType, HasEventType, ToolStreamPayloadType } from "./models";
import type {
  AnyAguiEvent,
  MessageState,
  ReduceResult,
  StepSource,
  ToolCallEndEvent,
  ToolCallStartEvent,
  ToolCallStreamEvent,
} from "./models";
import { interpretEvent } from "./interpret";
import { markStepsDone, newStep, reasoningStepId, updateStep } from "./steps";

// `state` is `prev` by reference when nothing changed, so callers can skip work on a no-op.
export function reduceEvent(
  prev: MessageState,
  event: AnyAguiEvent
): ReduceResult {
  const { progressText, answerDelta } = interpretEvent(event);
  return {
    state: nextState(prev, event, progressText, answerDelta),
    answerDelta,
  };
}

function nextState(
  prev: MessageState,
  event: AnyAguiEvent,
  progressText: string,
  answerDelta: string
): MessageState {
  switch (event.type) {
    case EventType.RUN_STARTED: {
      const label = progressText || prev.progressText;
      const reasoningSteps =
        prev.reasoningSteps.length === 0 && label
          ? [newStep("run-start", label)]
          : prev.reasoningSteps;
      return {
        ...prev,
        variant: prev.answerText ? "answer" : "progress",
        avatarState: "thinking",
        progressText: label,
        reasoningSteps,
      };
    }

    case EventType.RUN_ERROR:
      return {
        ...prev,
        variant: "error",
        avatarState: "done",
        reasoningSteps: markStepsDone(prev.reasoningSteps),
      };

    case EventType.TOOL_CALL_START: {
      const start = event as ToolCallStartEvent;
      const label = progressText || prev.progressText;
      const replacedId = start.extensions?.isFallback
        ? start.extensions?.replacedToolCallId
        : undefined;
      const newId = reasoningStepId(start, prev.reasoningSteps.length);

      if (
        replacedId &&
        prev.reasoningSteps.some((step) => step.id === replacedId)
      ) {
        const settled = markStepsDone(prev.reasoningSteps);
        const reasoningSteps = updateStep(settled, replacedId, (step) => ({
          ...step,
          id: newId,
          label,
          status: "active",
          detail: "",
          sources: [],
        }));
        return {
          ...prev,
          variant: prev.answerText ? "answer" : "progress",
          avatarState: "thinking",
          progressText: label,
          reasoningSteps,
        };
      }

      return {
        ...prev,
        variant: prev.answerText ? "answer" : "progress",
        avatarState: "thinking",
        progressText: label,
        reasoningSteps: [
          ...markStepsDone(prev.reasoningSteps),
          newStep(newId, label),
        ],
      };
    }

    case EventType.TOOL_CALL_END:
    case EventType.TOOL_CALL_RESULT: {
      const toolCallId = (event as ToolCallEndEvent).toolCallId;
      const reasoningSteps = updateStep(
        prev.reasoningSteps,
        toolCallId,
        (step) => (step.status === "done" ? step : { ...step, status: "done" })
      );
      if (reasoningSteps === prev.reasoningSteps) {
        return prev;
      }
      return { ...prev, reasoningSteps };
    }

    case HasEventType.TOOL_CALL_STREAM: {
      const stream = event as ToolCallStreamEvent;
      const payload = stream.payload;
      if (!payload) {
        return prev;
      }

      if (payload.type === ToolStreamPayloadType.DELTA) {
        const text = typeof payload.text === "string" ? payload.text : "";
        if (!text) {
          return prev;
        }
        const reasoningSteps = updateStep(
          prev.reasoningSteps,
          stream.toolCallId,
          (step) => ({
            ...step,
            detail: step.detail + text,
          })
        );
        if (reasoningSteps === prev.reasoningSteps) {
          return prev;
        }
        return { ...prev, reasoningSteps };
      }

      if (payload.type === ToolStreamPayloadType.CUSTOM) {
        const name = typeof payload.name === "string" ? payload.name : "";
        if (!name) {
          return prev;
        }
        const reasoningSteps = updateStep(
          prev.reasoningSteps,
          stream.toolCallId,
          (step) => {
            const source: StepSource = {
              id: `${name}-${step.sources.length}`,
              name,
              data: payload.data,
            };
            return { ...step, sources: [...step.sources, source] };
          }
        );
        if (reasoningSteps === prev.reasoningSteps) {
          return prev;
        }
        return { ...prev, reasoningSteps };
      }

      return prev;
    }

    case EventType.TEXT_MESSAGE_CONTENT:
      if (!answerDelta) {
        return prev;
      }
      return {
        ...prev,
        variant: "answer",
        avatarState: "thinking",
        answerText: prev.answerText + answerDelta,
        reasoningSteps: markStepsDone(prev.reasoningSteps),
      };

    default:
      return prev;
  }
}
