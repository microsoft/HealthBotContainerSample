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
import { useEffect, useRef, useState } from 'react';
import type { MessageState, ReasoningStep } from '../agui/messageState';
import type { MessageStore } from '../agui/messageStore';
import { useMessageState } from './useMessageState';
import { ReasoningDisclosure } from './ReasoningDisclosure';
import '../styles/Message.css';

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
      return <ProgressCard state={state} />;
  }
}

/** How long a freshly-arrived reasoning step stays on the live bubble before it collapses
 * into the "Thinking Process" dropdown. Steps arriving together show in parallel; each
 * collapses 5s after its own arrival. EXIT_MS matches the shrink-out animation. */
const LIVE_STEP_MS = 5000;
const EXIT_MS = 300;

interface LiveRow {
  id: string;
  label: string;
  leaving: boolean;
}

/**
 * Drive the live thinking bubble: each new reasoning step is added, then after LIVE_STEP_MS
 * marked `leaving` (shrink-out) and removed. Timing is view-only, so it lives here — not in
 * the store — and all timers are cleared on unmount.
 */
function useLiveSteps(steps: ReasoningStep[]): LiveRow[] {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const seen = useRef(new Set<string>());
  const timers = useRef<number[]>([]);

  useEffect(() => {
    steps.forEach((step) => {
      if (seen.current.has(step.id)) {
        return;
      }
      seen.current.add(step.id);
      setRows((prev) => [...prev, { id: step.id, label: step.label, leaving: false }]);
      timers.current.push(
        window.setTimeout(() => {
          setRows((prev) => prev.map((r) => (r.id === step.id ? { ...r, leaving: true } : r)));
          timers.current.push(
            window.setTimeout(() => setRows((prev) => prev.filter((r) => r.id !== step.id)), EXIT_MS),
          );
        }, LIVE_STEP_MS),
      );
    });
  }, [steps]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return rows;
}

/**
 * A1 · Live thinking bubble. The "Thinking Process" dropdown sits ON TOP (the full ordered
 * trace, on demand); below it a single bubble grows and shrinks as steps stream in and age
 * out. The answer is a separate track and is never gated by this.
 */
function ProgressCard({ state }: MessageViewProps): ReactElement {
  const live = useLiveSteps(state.reasoningSteps);
  return (
    <div className="has-msg__progress">
      <ReasoningDisclosure steps={state.reasoningSteps} variant="rail" />
      {live.length > 0 && (
        <div className="has-msg__live" aria-live="polite">
          {live.map((row) => (
            <div key={row.id} className="has-msg__live-step" data-leaving={row.leaving}>
              <span className="has-msg__dots" aria-hidden="true">
                <span className="has-msg__dot" />
                <span className="has-msg__dot" />
                <span className="has-msg__dot" />
              </span>
              <span>{row.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
      // A1 · Thinking chip (progress feature): the progress bubble now renders through
      // the redesigned structured card. Every other variant still delegates to Web Chat
      // until its own feature branch flips it — one variant at a time.
      case 'progress':
        return <MessageView state={state} />;

      // While the answer streams (and on every reveal frame after), keep the collapsible
      // reasoning trace ABOVE the answer so it never disappears mid-run. The final
      // reconciled activity re-adds it via activityMiddleware's F1 branch, so the trace is
      // continuous across thinking -> streaming -> final.
      case 'answer':
        return (
          <>
            {state.reasoningSteps.length > 0 && (
              <ReasoningDisclosure steps={state.reasoningSteps} variant="history" />
            )}
            {renderDefault()}
          </>
        );

      case 'error':
      case 'location':
      default:
        return <>{renderDefault()}</>;
    }
  }

  return <>{renderDefault()}</>;
}
