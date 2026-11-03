import type { ReactElement } from "react";
import type { ReasoningStep as Step } from "../../reducer/models";
import "./ReasoningStep.css";

interface ReasoningStepProps {
  step: Step;
  open: boolean;
  onToggle: () => void;
  /** True while the row is animating off the live rail. */
  leaving?: boolean;
}

function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim());
  return line ? line.trim() : "";
}

export function ReasoningStep({
  step,
  open,
  onToggle,
  leaving = false,
}: ReasoningStepProps): ReactElement {
  const preview = open ? "" : firstLine(step.detail);

  return (
    <li
      className="has-tp__step"
      data-status={step.status}
      data-open={open}
      data-leaving={leaving}
    >
      <button
        type="button"
        className="has-tp__title"
        aria-expanded={open}
        onClick={onToggle}
      >
        <span className="has-tp__mk" aria-hidden="true">
          {step.status === "done" ? "✓" : ""}
        </span>
        <span className="has-tp__lbl">{step.label}</span>
        {preview && <span className="has-tp__prev">{preview}</span>}
        {step.status === "active" && (
          <span className="has-tp__dots" aria-hidden="true">
            <span className="has-tp__dot" />
            <span className="has-tp__dot" />
            <span className="has-tp__dot" />
          </span>
        )}
        <span className="has-tp__chev" aria-hidden="true" />
      </button>
      {open && step.detail && (
        <div className="has-tp__content">{step.detail}</div>
      )}
    </li>
  );
}
