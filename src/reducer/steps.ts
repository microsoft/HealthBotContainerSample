import type { ReasoningStep } from "./models";

// Each helper returns the SAME array when nothing changed, so a no-op event cannot force a re-render.
export function reasoningStepId(
  event: { toolCallId?: string },
  index: number
): string {
  return typeof event.toolCallId === "string" && event.toolCallId
    ? event.toolCallId
    : `step-${index}`;
}

export function markStepsDone(steps: ReasoningStep[]): ReasoningStep[] {
  if (!steps.some((step) => step.status === "active")) {
    return steps;
  }
  return steps.map((step) =>
    step.status === "active" ? { ...step, status: "done" as const } : step
  );
}

export function updateStep(
  steps: ReasoningStep[],
  id: string | undefined,
  updater: (step: ReasoningStep) => ReasoningStep
): ReasoningStep[] {
  if (!id) {
    return steps;
  }
  const index = steps.findIndex((step) => step.id === id);
  if (index < 0) {
    return steps;
  }
  const nextStep = updater(steps[index]);
  if (nextStep === steps[index]) {
    return steps;
  }
  const copy = steps.slice();
  copy[index] = nextStep;
  return copy;
}

export function newStep(id: string, label: string): ReasoningStep {
  return { id, label, status: "active", detail: "", sources: [] };
}
