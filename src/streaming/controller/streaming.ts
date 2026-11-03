import { EventType, createInitialMessageState } from "../../reducer/models";
import type { AnyAguiEvent, MessageState } from "../../reducer/models";
import { reduceEvent } from "../../reducer/reduce";
import {
  parseStreamEnvelope,
  isStreamFrame,
} from "../../reducer/parseEnvelope";
import { DEFAULT_PROGRESS_ID, INCOMING_ACTIVITY, MESSAGE } from "../wire";
import type { Timers } from "../timers";
import type { Activity, WebChatStore } from "../wire";
import { createRevealClock } from "../pacing";
import {
  MAX_PROGRESS_LINE_VISIBLE_MS,
  beginTurn,
  createExpiryState,
  createRunState,
} from "./models";
import type { StreamController, StreamDirective } from "./models";

const defaultDeps: Timers = {
  setTimeout: (handler, ms) => setTimeout(handler, ms) as unknown as number,
  clearTimeout: (id) => clearTimeout(id),
  now: () => Date.now(),
};

export function createController(deps: Timers = defaultDeps): StreamController {
  const { setTimeout, clearTimeout, now } = deps;

  let state: MessageState = createInitialMessageState();

  const run = createRunState();
  const reveal = createRevealClock(deps);
  const expiry = createExpiryState();
  let lastFrameKey: string | null = null;
  let streamSeen = false;
  const streamListeners = new Set<() => void>();

  function markStreamSeen() {
    if (streamSeen) {
      return;
    }
    streamSeen = true;
    streamListeners.forEach((listener) => listener());
  }

  function cancelReveal() {
    reveal.reset();
    lastFrameKey = null;
  }

  function visibleSignature(view: MessageState): string {
    return JSON.stringify([
      view.variant,
      view.avatarState,
      view.progressText,
      view.answerText.length,
      view.reasoningSteps.map((step) => [
        step.id,
        step.label,
        step.status,
        step.detail.length,
        step.sources.length,
      ]),
    ]);
  }

  // Every streamed frame carries the turn's state, so the view renders from the activity itself.
  function dispatchFrame(
    store: WebChatStore,
    view: MessageState,
    options: { expired?: boolean } = {}
  ) {
    run.bubbleDispatched = true;
    store.dispatch({
      type: INCOMING_ACTIVITY,
      payload: {
        activity: {
          id: run.progressId || DEFAULT_PROGRESS_ID,
          type: MESSAGE,
          text: options.expired ? "" : view.answerText,
          from: { role: "bot", id: "has-stream", name: "Bot" },
          timestamp: new Date(now()).toISOString(),
          channelData: {
            hasStreamReveal: true,
            state: view,
            ...(options.expired ? { hasStreamExpired: true } : {}),
          },
        },
      },
    });
  }

  // Steps with no label and no detail have nothing to show, so they raise no frame.
  function hasVisibleContent(candidate: MessageState): boolean {
    return (
      candidate.answerText.length > 0 ||
      candidate.reasoningSteps.some((step) => step.label || step.detail)
    );
  }

  function publish(
    store: WebChatStore,
    view: MessageState = reveal.view(state)
  ) {
    if (!hasVisibleContent(view)) {
      return;
    }
    const key = visibleSignature(view);
    if (key === lastFrameKey) {
      return;
    }
    lastFrameKey = key;
    dispatchFrame(store, view);
  }

  function expireProgressBubble(store: WebChatStore) {
    cancelReveal();
    if (run.bubbleDispatched) {
      dispatchFrame(store, state, { expired: true });
    }
    run.bubbleDispatched = false;
    run.awaitingFinal = false;
  }

  function clearProgressExpiry() {
    if (expiry.loop) {
      clearTimeout(expiry.loop);
      expiry.loop = null;
    }
  }

  function armProgressExpiry(store: WebChatStore) {
    clearProgressExpiry();
    expiry.loop = setTimeout(() => {
      expiry.loop = null;
      expireProgressBubble(store);
    }, MAX_PROGRESS_LINE_VISIBLE_MS);
  }

  function resetForNewTurn(store: WebChatStore) {
    if (run.awaitingFinal && store) {
      expireProgressBubble(store);
    }
    clearProgressExpiry();
    cancelReveal();
    state = createInitialMessageState();
    beginTurn(run);
    run.live = true;
  }

  function applyStreamEvent(store: WebChatStore, ev: AnyAguiEvent) {
    state = reduceEvent(state, ev).state;
    run.awaitingFinal = true;
    if (!run.live) {
      return;
    }
    // Arm the safety valve for every stream event: a run made only of events the reducer
    // ignores would otherwise leave this turn awaiting a final activity forever.
    armProgressExpiry(store);

    if (ev.type === EventType.RUN_ERROR) {
      reveal.stop();
      reveal.sync(state);
      const pending = !reveal.isDone();
      reveal.flush();
      if (pending && run.bubbleDispatched) {
        const view = reveal.view(state);
        publish(
          store,
          view.answerText ? view : { ...view, variant: "progress" }
        );
      }
      return;
    }

    reveal.sync(state);
    reveal.start(() => publish(store));
    publish(store);
  }

  function handleIncoming(
    store: WebChatStore,
    activity: unknown
  ): StreamDirective {
    const incoming = activity as Activity | null | undefined;

    if (
      incoming &&
      incoming.channelData &&
      incoming.channelData.hasStreamReveal
    ) {
      return "passthrough";
    }

    if (incoming && incoming.type === "typing" && run.awaitingFinal) {
      return "swallow";
    }

    const stream = parseStreamEnvelope(incoming);
    if (stream) {
      markStreamSeen();
      if (run.answered) {
        beginTurn(run);
        state = createInitialMessageState();
        cancelReveal();
      }

      if (stream.runId && stream.runId !== run.runId) {
        // A new run starts from a clean picture: the previous run's steps and answer must not
        // carry over, or they are rendered again and the answer double-accumulates.
        run.runId = stream.runId;
        state = createInitialMessageState();
        cancelReveal();
      }

      if (!run.progressId) {
        run.progressId = DEFAULT_PROGRESS_ID;
      }
      for (const ev of stream.events) {
        applyStreamEvent(store, ev);
      }
      return "swallow";
    }

    if (isStreamFrame(incoming)) {
      return "swallow";
    }

    if (
      run.awaitingFinal &&
      incoming &&
      incoming.from &&
      incoming.from.role === "bot" &&
      incoming.type === MESSAGE
    ) {
      clearProgressExpiry();
      incoming.id = run.progressId || DEFAULT_PROGRESS_ID;
      // Carry the turn's state onto the bot's own activity so the trace survives the handover.
      incoming.channelData = { ...incoming.channelData, state };
      run.awaitingFinal = false;
      run.answered = true;
      cancelReveal();
      return "forward-final";
    }

    return "forward";
  }

  return {
    resetForNewTurn,
    handleIncoming,
    hasSeenStream: () => streamSeen,
    onFirstStream(listener) {
      streamListeners.add(listener);
      return () => streamListeners.delete(listener);
    },
  };
}
