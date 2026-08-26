/*
 * Streaming UI controller for the Health Bot container sample.
 *
 * HealthBot forwards every Orchestrator AG-UI event to the browser as a durable
 * Direct Line message envelope:
 *
 *   { type: "message", value: { stream: { streamId, event: { type, ... } } } }
 *
 * The browser — not HealthBot — interprets that envelope and turns it into a single
 * temporary Web Chat bubble that grows as progress and answer text arrive, then is
 * replaced by the authoritative final bot activity.
 *
 * This module owns all streaming state and animation. src/chat/createChatStore.ts wires
 * it into the Web Chat store middleware. It has no framework or DOM dependency: the only
 * environment it touches (timers + clock) is injected via ControllerDeps, which defaults
 * to the real globals in the browser and to a virtual clock in the unit test.
 *
 * Note: TOOL_CALL_CHUNK is intentionally NOT rendered. answerDelta() is the single
 * answer-interpretation point where that support can be added later, together with a
 * separately designed reconciliation policy, without touching transport detection,
 * typing ownership, or final replacement.
 */

import { EventType } from './agui/events.ts';
import { interpretEvent } from './agui/registry.ts';
import type { AnyAguiEvent } from './agui/registry.ts';
import { parseStreamEnvelope, isStreamFrame } from './agui/parseEnvelope.ts';
import type { StreamEnvelope } from './agui/parseEnvelope.ts';
import { messageStore } from './agui/messageStore.ts';
import type { MessageStore } from './agui/messageStore.ts';

export type StreamDirective = 'passthrough' | 'swallow' | 'forward' | 'forward-final';

export interface WebChatStore {
  dispatch: (action: unknown) => unknown;
  getState?: () => unknown;
}

export interface StreamController {
  resetForNewTurn(store: WebChatStore): void;
  handleIncoming(store: WebChatStore, activity: unknown): StreamDirective;
  stopTypingAfterFinal(): void;
}

// Injectable timer + clock. Keeping these out of the module body is what lets the
// controller stay framework-free and its animation loops be driven deterministically
// from the unit test (which supplies a virtual clock and a manually drained queue).
export interface ControllerDeps {
  setTimeout: (handler: () => void, ms: number) => number;
  clearTimeout: (id: number) => void;
  now: () => number;
  // The structured view-model sink. Defaults to the app-wide singleton; injectable so
  // unit tests can supply an isolated store (or a spy) without touching global state.
  messageStore?: MessageStore;
}

interface ActivityFrom {
  role?: string;
  id?: string;
  name?: string;
}

// Shape of a Direct Line activity as seen by the controller. All fields are optional
// because activities arrive from several sources (bot, synthetic reveal, typing).
interface Activity {
  id?: string;
  type?: string;
  name?: string;
  text?: string;
  from?: ActivityFrom;
  timestamp?: string;
  channelData?: Record<string, unknown>;
  value?: { stream?: StreamEnvelope };
  [key: string]: unknown;
}

const incomingActivityActionType = 'DIRECT_LINE/INCOMING_ACTIVITY';
const activityMessageType = 'message';

const ANSWER_REVEAL_MS = 12;
const STREAM_TYPING_REFRESH_MS = 1000;
const MAX_STREAM_TYPING_DURATION_MS = 5 * 60 * 1000;
// A temporary progress/answer bubble is only ever a placeholder for the
// authoritative final activity. If that final activity never arrives, the bubble
// must not linger on screen forever, so it is retired after this window of
// inactivity. The window is refreshed every time new progress or answer content
// arrives, and cleared once the final activity replaces the bubble.
const MAX_PROGRESS_LINE_VISIBLE_MS = 5 * 60 * 1000;

const defaultDeps: ControllerDeps = {
  setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
  now: () => Date.now(),
};

// Map a supported event to safe, user-visible progress text via the shared event
// registry (src/agui/registry.ts). Never exposes a raw tool name, tool arguments,
// custom payloads, or unknown extension values; unknown events yield ''.
export function streamProgressText(event: AnyAguiEvent): string {
  return interpretEvent(event).progressText;
}

// Single answer-delta interpretation point, delegated to the shared event registry.
// Extending which events contribute answer text is a one-line registry change; the
// controller's transport/typing/replacement logic stays untouched. (TOOL_CALL_CHUNK
// remains intentionally non-contributing here — see the module header.)
export function answerDelta(event: AnyAguiEvent): string {
  return interpretEvent(event).answerDelta;
}

export function createController(deps: ControllerDeps = defaultDeps): StreamController {
  const { setTimeout, clearTimeout, now } = deps;
  // Structured view-model sink (src/agui/messageStore.ts). The controller keeps owning
  // orchestration + timers; it now ALSO folds each event into MessageState so the React
  // layer can render declaratively. Defaults to the shared singleton.
  const msgStore: MessageStore = deps.messageStore ?? messageStore;

  // Turn and identity state
  let streamTurn = 0;
  let streamProgressId: string | null = null;
  let streamId: string | null = null;

  // Lifecycle state
  let streamAwaitingFinal = false;
  let streamAnswerStarted = false;
  let lastProgressText = '';

  // Content and animation state
  let answerBuffer = '';
  // The progress bubble is created once per turn so activityMiddleware can mount the
  // structured <ProgressCard>. Its live reasoning steps come from messageStore (the React
  // layer subscribes), so streaming.ts no longer animates progress text itself.
  let progressBubbleShown = false;
  let answerTarget = '';
  let answerShown = 0;
  let answerLoop: number | null = null;

  // Typing state
  let streamTypingActive = false;
  let streamTypingLoop: number | null = null;
  let streamTypingStartedAt: number | null = null;
  let streamTypingFrom: ActivityFrom | null = null;
  let lastBotTypingActivity: Activity | null = null;

  // Bubble-expiry state
  let progressExpiryLoop: number | null = null;

  function cancelAnswerReveal() {
    if (answerLoop) {
      clearTimeout(answerLoop);
      answerLoop = null;
    }
    answerTarget = '';
    answerShown = 0;
  }

  // Cancel only the answer stream. The progress rail is driven declaratively from
  // messageStore (no timers here), so there is nothing else to tear down.
  function cancelReveal() {
    cancelAnswerReveal();
  }

  function dispatchStreamTyping(store: WebChatStore) {
    if (!streamTypingActive) {
      return;
    }

    const typingActivity: Activity = lastBotTypingActivity || {};
    store.dispatch({
      type: incomingActivityActionType,
      payload: {
        activity: {
          ...typingActivity,
          id: (streamProgressId || 'has-stream-progress-0') + '-typing',
          type: 'typing',
          from: typingActivity.from
            || streamTypingFrom
            || { role: 'bot', id: 'has-stream', name: 'Bot' },
          timestamp: new Date(now()).toISOString(),
          channelData: {
            ...(typingActivity.channelData || {}),
            hasStreamTyping: true,
          },
        },
      },
    });
  }

  function scheduleStreamTyping(store: WebChatStore) {
    if (streamTypingLoop || !streamTypingActive) {
      return;
    }

    streamTypingLoop = setTimeout(() => {
      streamTypingLoop = null;
      if (!streamTypingActive) {
        return;
      }
      if (streamTypingStartedAt !== null
        && now() - streamTypingStartedAt >= MAX_STREAM_TYPING_DURATION_MS) {
        stopStreamTyping();
        return;
      }
      dispatchStreamTyping(store);
      scheduleStreamTyping(store);
    }, STREAM_TYPING_REFRESH_MS);
  }

  function startStreamTyping(store: WebChatStore, from?: ActivityFrom) {
    if (from && from.role === 'bot') {
      streamTypingFrom = from;
    }
    if (streamTypingStartedAt === null) {
      streamTypingStartedAt = now();
    }
    if (now() - streamTypingStartedAt >= MAX_STREAM_TYPING_DURATION_MS) {
      stopStreamTyping();
      return;
    }
    if (streamTypingActive) {
      return;
    }
    streamTypingActive = true;
    dispatchStreamTyping(store);
    scheduleStreamTyping(store);
  }

  function stopStreamTyping() {
    streamTypingActive = false;
    if (streamTypingLoop) {
      clearTimeout(streamTypingLoop);
      streamTypingLoop = null;
    }
    streamTypingFrom = null;
  }

  function resetStreamTyping() {
    stopStreamTyping();
    streamTypingStartedAt = null;
  }

  // Retire the temporary bubble once it has been visible for too long without
  // being replaced by the authoritative final activity. Clears the placeholder
  // text and tears down all streaming animation/typing for the turn so nothing
  // lingers on screen; a late final activity is then handled as an ordinary
  // bot message.
  function expireProgressBubble(store: WebChatStore) {
    cancelReveal();
    resetStreamTyping();
    store.dispatch({
      type: incomingActivityActionType,
      payload: {
        activity: {
          id: streamProgressId || 'has-stream-progress-0',
          type: activityMessageType,
          text: '',
          from: { role: 'bot', id: 'has-stream', name: 'Bot' },
          timestamp: new Date(now()).toISOString(),
          channelData: { hasStreamReveal: true, hasStreamExpired: true },
        },
      },
    });
    streamAwaitingFinal = false;
    streamAnswerStarted = false;
    lastProgressText = '';
    answerBuffer = '';
  }

  function clearProgressExpiry() {
    if (progressExpiryLoop) {
      clearTimeout(progressExpiryLoop);
      progressExpiryLoop = null;
    }
  }

  // Refresh the inactivity window guarding the temporary bubble. Called on every
  // new progress/answer frame so an actively growing bubble is never retired.
  function armProgressExpiry(store: WebChatStore) {
    clearProgressExpiry();
    progressExpiryLoop = setTimeout(() => {
      progressExpiryLoop = null;
      expireProgressBubble(store);
    }, MAX_PROGRESS_LINE_VISIBLE_MS);
  }

  // Create the temporary progress bubble once per turn. It carries no visible text of its
  // own — activityMiddleware mounts <ProgressCard>, which renders the live reasoning steps
  // straight from messageStore. Subsequent events re-render it via that subscription, so
  // there is nothing to animate here.
  function showProgressBubble(store: WebChatStore) {
    if (progressBubbleShown) {
      return;
    }
    progressBubbleShown = true;
    store.dispatch({
      type: incomingActivityActionType,
      payload: {
        activity: {
          id: streamProgressId || 'has-stream-progress-0',
          type: activityMessageType,
          text: '',
          from: { role: 'bot', id: 'has-stream', name: 'Bot' },
          timestamp: new Date(now()).toISOString(),
          channelData: { hasStreamReveal: true },
        },
      },
    });
  }

  function showAnswer(store: WebChatStore, activityId: string, text: string) {
    const full = text || '';
    if (full.length <= answerTarget.length) {
      return;
    }
    answerTarget = full;
    // The answer is a SEPARATE track from the thinking rail and must never wait for it.
    // Start streaming the answer immediately; the full reasoning trace stays in the
    // "Thinking Process" disclosure, so nothing is lost.
    if (!answerLoop) {
      stepAnswer(store, activityId);
    }
  }

  function stepAnswer(store: WebChatStore, activityId: string) {
    answerLoop = null;
    const backlog = answerTarget.length - answerShown;
    if (backlog > 0) {
      const chunk = Math.max(1, Math.ceil(backlog / 8));
      answerShown += chunk;
      store.dispatch({
        type: incomingActivityActionType,
        payload: {
          activity: {
            id: activityId,
            type: activityMessageType,
            text: answerTarget.slice(0, answerShown),
            from: { role: 'bot', id: 'has-stream', name: 'Bot' },
            timestamp: new Date(now()).toISOString(),
            channelData: { hasStreamReveal: true },
          },
        },
      });
      if (answerShown < answerTarget.length) {
        answerLoop = setTimeout(() => stepAnswer(store, activityId), ANSWER_REVEAL_MS);
      }
    }
  }

  // Reset all stream state for a new outgoing turn. If the previous turn's
  // temporary bubble is still awaiting its final activity (e.g. the user sent a
  // new message mid-stream), retire it first so it can't be orphaned on screen.
  function resetForNewTurn(store: WebChatStore) {
    if (streamAwaitingFinal && store) {
      expireProgressBubble(store);
    }
    // F1 (clarify Q3): each answer keeps its own reasoning trace for the session, so we
    // deliberately DO NOT drop the previous bubble's structured state here. The store is
    // keyed per-turn (unique streamProgressId), so the next turn starts clean on its own
    // fresh id while past turns' traces remain readable by the F1 history disclosure
    // rendered above each answer (see activityMiddleware). Retention is per-session and
    // in-memory only; it is cleared when the page reloads / a new conversation starts.
    resetStreamTyping();
    clearProgressExpiry();
    lastBotTypingActivity = null;
    cancelReveal();
    streamTurn += 1;
    streamProgressId = 'has-stream-progress-' + streamTurn;
    streamId = null;
    streamAwaitingFinal = false;
    streamAnswerStarted = false;
    lastProgressText = '';
    answerBuffer = '';
    progressBubbleShown = false;
  }

  // Interpret one incoming Direct Line activity and tell the middleware what to do:
  //   'passthrough'   - a synthetic reveal/typing frame we created; forward as-is
  //   'swallow'       - suppressed typing or a raw stream envelope; do NOT forward
  //   'forward-final' - authoritative final bot activity; id reconciled, forward then
  //                     call stopTypingAfterFinal()
  //   'forward'       - nothing streaming-related; middleware forwards normally
  function handleIncoming(store: WebChatStore, activity: unknown): StreamDirective {
    const incoming = activity as Activity | null | undefined;

    if (incoming && incoming.channelData
      && (incoming.channelData.hasStreamReveal || incoming.channelData.hasStreamTyping)) {
      return 'passthrough';
    }

    if (incoming && incoming.type === 'typing' && incoming.from && incoming.from.role === 'bot') {
      lastBotTypingActivity = incoming;
    }
    if (incoming && incoming.type === 'typing' && (streamAwaitingFinal || streamTypingActive)) {
      return 'swallow';
    }

    const stream = parseStreamEnvelope(incoming);
    if (stream) {
      if (stream.streamId && stream.streamId !== streamId) {
        streamId = stream.streamId;
        answerBuffer = '';
        // A fresh stream restarts answer accumulation; drop any reveal state
        // from the previous stream so a shorter new answer isn't swallowed.
        cancelAnswerReveal();
      }

      const ev = stream.event;
      if (!streamProgressId) {
        streamProgressId = 'has-stream-progress-0';
      }
      // Fold every event into the structured view-model for this bubble. This is a pure
      // state update (no rendering); the React <Message> subscribed to this id re-renders
      // if — and only if — the state actually changed. Orchestration continues below.
      msgStore.applyEvent(streamProgressId, ev as AnyAguiEvent);
      if (ev.type === EventType.RUN_ERROR) {
        cancelReveal();
        resetStreamTyping();
        // Keep streamProgressId and stay awaiting so the bot's error message
        // replaces the progress bubble instead of rendering beside it. Reset
        // on the next outgoing user activity. Guard the placeholder with the
        // inactivity window in case that error message never arrives.
        streamAwaitingFinal = true;
        armProgressExpiry(store);
        return 'swallow';
      }
      if (ev.type === EventType.RUN_STARTED) {
        resetStreamTyping();
      }
      startStreamTyping(store, incoming ? incoming.from : undefined);
      streamAwaitingFinal = true;

      // Interpret the event once via the shared registry (progress + answer).
      const { progressText, answerDelta: delta } = interpretEvent(ev);
      if (delta) {
        if (!streamAnswerStarted) {
          streamAnswerStarted = true;
        }
        streamAwaitingFinal = true;
        answerBuffer += delta;
        showAnswer(store, streamProgressId, answerBuffer);
        armProgressExpiry(store);
      } else if (!streamAnswerStarted) {
        if (progressText && progressText !== lastProgressText) {
          lastProgressText = progressText;
          streamAwaitingFinal = true;
          showProgressBubble(store);
          armProgressExpiry(store);
        }
      }
      return 'swallow';
    }

    // A message carrying a stream payload but no well-formed event is still a stream
    // frame: swallow it rather than mistaking it for the authoritative final message.
    if (isStreamFrame(incoming)) {
      return 'swallow';
    }

    if (streamAwaitingFinal
      && incoming && incoming.from && incoming.from.role === 'bot'
      && incoming.type === activityMessageType) {
      cancelReveal();
      clearProgressExpiry();
      incoming.id = streamProgressId || 'has-stream-progress-0';
      streamAwaitingFinal = false;
      return 'forward-final';
    }

    return 'forward';
  }

  // Called by the middleware after forwarding the final activity so synthetic
  // typing stops and the authoritative activity takes over cleanly.
  function stopTypingAfterFinal() {
    resetStreamTyping();
    clearProgressExpiry();
  }

  return {
    resetForNewTurn,
    handleIncoming,
    stopTypingAfterFinal,
  };
}
