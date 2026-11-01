import { useState } from "react";
import type { ReactElement } from "react";
import type { ReasoningStep as Step } from "../../reducer/models";
import { ReasoningStep } from "../ReasoningStep/ReasoningStep";
import { useLiveSteps } from "./useLiveSteps";
import "./ThinkingProcess.css";

interface ThinkingProcessProps {
  steps: Step[];
  /** True once the answer has started streaming — the live rail gives way to the answer. */
  answerStarted?: boolean;
}

export function ThinkingProcess({
  steps,
  answerStarted = false,
}: ThinkingProcessProps): ReactElement | null {
  const [outerOpen, setOuterOpen] = useState(false);
  const [openSteps, setOpenSteps] = useState<Record<string, boolean>>({});
  const live = useLiveSteps(steps);

  if (steps.length === 0) {
    return null;
  }

  const count = steps.length;
  const byId = new Map(steps.map((step) => [step.id, step]));
  const liveSteps = live
    .map((row) => ({ leaving: row.leaving, step: byId.get(row.id) }))
    .filter((entry): entry is { leaving: boolean; step: Step } =>
      Boolean(entry.step)
    );

  const toggle = (step: Step, open: boolean) =>
    setOpenSteps((prev) => ({ ...prev, [step.id]: !open }));

  const renderStep = (step: Step, leaving = false): ReactElement => {
    const open = openSteps[step.id] ?? step.status === "active";
    return (
      <ReasoningStep
        key={step.id}
        step={step}
        open={open}
        leaving={leaving}
        onToggle={() => toggle(step, open)}
      />
    );
  };

  const showLiveRail = !outerOpen && !answerStarted && liveSteps.length > 0;

  return (
    <div className="has-tp" data-open={outerOpen}>
      <button
        type="button"
        className="has-tp__summary"
        aria-expanded={outerOpen}
        onClick={() => setOuterOpen((open) => !open)}
      >
        <span>
          Thinking Process · {count} step{count === 1 ? "" : "s"}
        </span>
        <span className="has-tp__ochev" aria-hidden="true" />
      </button>

      {outerOpen && (
        <ul className="has-tp__steps">
          {steps.map((step) => renderStep(step))}
        </ul>
      )}

      {showLiveRail && (
        <ul className="has-tp__steps has-tp__steps--live" aria-live="polite">
          {liveSteps.map(({ leaving, step }) => renderStep(step, leaving))}
        </ul>
      )}
    </div>
  );
}
