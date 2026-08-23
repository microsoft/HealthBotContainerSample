/*
 * <Message> — the B4 structural backbone of the redesigned chat.
 *
 * Two exports, deliberately separated:
 *
 *   • MessageView — a PURE, presentational component. Given a MessageState it renders
 *     the structured card for that variant. It has no store, no side effects, no data
 *     fetching — so it can be previewed in every state in the component gallery
 *     (E14, src/gallery) and asserted with react-dom/server in unit tests. This is the
 *     surface every redesign feature designs against.
 *
 *   • Message — the CONTAINER wired into Web Chat via activityMiddleware. It subscribes
 *     the bubble to its live MessageState (useMessageState → useSyncExternalStore) so
 *     the whole structured spine runs end-to-end. In THIS foundation it renders the
 *     proven Web Chat bubble unchanged (Q5: the redesign stays invisible until a feature
 *     opts a variant in). Each feature branch flips one `case` below from
 *     `renderDefault()` to a <MessageView> branch — and touches no other file.
 */

import type { ReactElement, ReactNode } from 'react';
import type { MessageState } from '../agui/messageState';
import type { MessageStore } from '../agui/messageStore';
import { useMessageState } from './useMessageState';
import './Message.css';

interface MessageViewProps {
  state: MessageState;
}

/** Pure structured card for a single message. The redesign's design surface. */
export function MessageView({ state }: MessageViewProps): ReactElement {
  return (
    <div className="has-msg" data-variant={state.variant} data-avatar={state.avatarState}>
      {renderVariant(state)}
    </div>
  );
}

function renderVariant(state: MessageState): ReactNode {
  switch (state.variant) {
    case 'answer':
      return (
        <div className="has-msg__answer">
          <p className="has-msg__answer-text">{state.answerText}</p>
          {state.citations.length > 0 && (
            <ul className="has-msg__citations">
              {state.citations.map((c) => (
                <li key={c.id} className="has-msg__citation">
                  {c.url ? <a href={c.url}>{c.title ?? c.url}</a> : (c.title ?? c.id)}
                </li>
              ))}
            </ul>
          )}
        </div>
      );

    case 'error':
      return (
        <div className="has-msg__error" role="alert">
          {state.answerText || 'Something went wrong. Please try again.'}
        </div>
      );

    case 'location':
      return (
        <div className="has-msg__location">
          {state.progressText || 'Sharing your location…'}
        </div>
      );

    case 'progress':
    default:
      return (
        <div className="has-msg__progress">
          <span className="has-msg__progress-line">{state.progressText}</span>
          {state.reasoningSteps.length > 0 && (
            <ol className="has-msg__steps">
              {state.reasoningSteps.map((step) => (
                <li key={step.id} className="has-msg__step" data-status={step.status}>
                  {step.label}
                </li>
              ))}
            </ol>
          )}
        </div>
      );
  }
}

interface MessageProps {
  /** The streaming activity id joining this bubble to its state (e.g. "has-stream-progress-0"). */
  activityId: string;
  /** Render Web Chat's default bubble for this activity (the middleware `next(...)`). */
  renderDefault: () => ReactNode;
  /** Store to read from; defaults to the app singleton. Injectable for tests/gallery. */
  store?: MessageStore;
}

/**
 * Container rendered by activityMiddleware for streaming bubbles. Holds the live
 * subscription; delegates rendering to Web Chat while the foundation is invisible.
 */
export function Message({ activityId, renderDefault, store }: MessageProps): ReactElement {
  const state = useMessageState(activityId, store);

  if (state) {
    switch (state.variant) {
      // Redesign features flip these branches to `return <MessageView state={state} />;`
      // one at a time. Until then every variant delegates → identical UX (Q5).
      case 'answer':
      case 'progress':
      case 'error':
      case 'location':
      default:
        return <>{renderDefault()}</>;
    }
  }

  return <>{renderDefault()}</>;
}
