import type { WebChatStore } from "../wire";
import { STREAM_ACTIVITY_ID_PREFIX } from "../wire";

export type StreamDirective =
  | "passthrough"
  | "swallow"
  | "forward"
  | "forward-final";

export interface StreamController {
  resetForNewTurn(store: WebChatStore): void;
  handleIncoming(store: WebChatStore, activity: unknown): StreamDirective;
  /** True once the bot has sent a stream frame, i.e. it shows its own progress. */
  hasSeenStream(): boolean;
  /** Calls the listener when the first stream frame arrives; returns an unsubscribe. */
  onFirstStream(listener: () => void): () => void;
}

export const MAX_PROGRESS_LINE_VISIBLE_MS = 5 * 60 * 1000;

/** What the controller knows about the turn currently in flight. */
export interface RunState {
  /** Increments once per user turn; only used to build a unique progress id. */
  turn: number;
  progressId: string | null;
  /** The run the stream frames belong to. A change means the server restarted the answer. */
  runId: string | null;
  awaitingFinal: boolean;
  /** True once a bubble has reached the screen, so retirement has something to retire. */
  bubbleDispatched: boolean;
  answered: boolean;
  live: boolean;
}

export function createRunState(): RunState {
  return {
    turn: 0,
    progressId: null,
    runId: null,
    awaitingFinal: false,
    bubbleDispatched: false,
    answered: false,
    live: false,
  };
}

// The turn counter survives: it is what makes each turn's progress id unique.
export function beginTurn(run: RunState): void {
  run.turn += 1;
  run.progressId = `${STREAM_ACTIVITY_ID_PREFIX}${run.turn}`;
  run.runId = null;
  run.awaitingFinal = false;
  run.bubbleDispatched = false;
  run.answered = false;
}

/** The safety valve that retires a bubble left behind by a run that never finished. */
export interface ExpiryState {
  loop: number | null;
}

export function createExpiryState(): ExpiryState {
  return { loop: null };
}
