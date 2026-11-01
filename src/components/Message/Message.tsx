import type { ReactElement, ReactNode } from "react";
import type { MessageState } from "../../reducer/models";
import { ProgressBubble } from "../ProgressBubble/ProgressBubble";
import { ThinkingProcess } from "../ThinkingProcess/ThinkingProcess";
import "./Message.css";

interface MessageViewProps {
  state: MessageState;
}

interface MessageProps {
  state: MessageState;
  /** Web Chat's own rendering of the activity, used for the final reconciled answer. */
  renderDefault: () => ReactNode;
}

export function MessageView({ state }: MessageViewProps): ReactElement {
  return (
    <div
      className="has-msg"
      data-variant={state.variant}
      data-avatar={state.avatarState}
    >
      <ProgressBubble steps={state.reasoningSteps} />
    </div>
  );
}

export function Message({ state, renderDefault }: MessageProps): ReactElement {
  switch (state.variant) {
    case "progress":
      return <MessageView state={state} />;

    case "answer":
      return (
        <>
          {state.reasoningSteps.length > 0 && (
            <ThinkingProcess steps={state.reasoningSteps} answerStarted />
          )}
          {renderDefault()}
        </>
      );

    // "error": the bot sends its own error message, which replaces the progress bubble.
    default:
      return <>{renderDefault()}</>;
  }
}
