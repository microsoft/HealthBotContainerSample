import { Message } from "../../components/Message/Message";
import { AnswerWithCitations } from "../../components/AnswerWithCitations/AnswerWithCitations";
import { citationSources } from "../../components/AnswerWithCitations/citationSources";
import { ThinkingProcess } from "../../components/ThinkingProcess/ThinkingProcess";
import type { MessageState } from "../../reducer/models";
import { STREAM_ACTIVITY_ID_PREFIX } from "../wire";
import type {
  ActivityCard,
  LegacyRenderFunction,
  NextFn,
  RenderResult,
} from "./models";

function streamState(card: ActivityCard | undefined): MessageState | undefined {
  return card?.activity?.channelData?.state;
}

function streamActivityId(card: ActivityCard | undefined): string | undefined {
  const id = card?.activity?.id;
  return typeof id === "string" && id.startsWith(STREAM_ACTIVITY_ID_PREFIX)
    ? id
    : undefined;
}

function isStreamingActivity(card: ActivityCard | undefined): boolean {
  return Boolean(
    // Gate on the flag, not the id prefix: the reconciled final activity shares the id.
    card?.activity?.channelData?.hasStreamReveal === true &&
      streamActivityId(card)
  );
}

// Must return a render FUNCTION, not an element, or Web Chat throws "render is not a function".
export const activityMiddleware =
  () =>
  (next: NextFn) =>
  (...renderArgs: unknown[]): RenderResult => {
    const card = renderArgs[0] as ActivityCard | undefined;

    if (card?.activity?.channelData?.hasStreamExpired) {
      return false;
    }

    const renderNext = next(...renderArgs);
    const renderDefaultWith: LegacyRenderFunction = (
      renderAttachment,
      options
    ) =>
      typeof renderNext === "function"
        ? renderNext(renderAttachment, options)
        : null;

    const sources = citationSources(card?.activity?.attachments);

    if (isStreamingActivity(card)) {
      const state = streamState(card);
      if (state) {
        // The paced final answer is released with hasStreamReveal, so it renders through here too.
        return (renderAttachment, options) => (
          <Message
            state={state}
            renderDefault={() => (
              <AnswerWithCitations sources={sources}>
                {renderDefaultWith(renderAttachment, options)}
              </AnswerWithCitations>
            )}
          />
        );
      }
    }

    if (streamActivityId(card)) {
      // Web Chat chose not to render this activity; keep it suppressed.
      if (typeof renderNext !== "function") {
        return renderNext;
      }
      const finalState = streamState(card);
      return (renderAttachment, options) => (
        <AnswerWithCitations sources={sources}>
          {finalState && finalState.reasoningSteps.length > 0 && (
            <ThinkingProcess steps={finalState.reasoningSteps} answerStarted />
          )}
          {renderDefaultWith(renderAttachment, options)}
        </AnswerWithCitations>
      );
    }

    return renderNext;
  };
