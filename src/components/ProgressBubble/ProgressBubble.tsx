import type { ReactElement } from "react";
import type { ReasoningStep } from "../../reducer/models";
import { ThinkingProcess } from "../ThinkingProcess/ThinkingProcess";
import "./ProgressBubble.css";

interface ProgressBubbleProps {
  steps: ReasoningStep[];
}

export function ProgressBubble({ steps }: ProgressBubbleProps): ReactElement {
  return (
    <div className="has-msg__progress">
      <ThinkingProcess steps={steps} answerStarted={false} />
    </div>
  );
}
