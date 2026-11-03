import { describe, it, expect, vi } from "vitest";

import { createController } from "./streaming";
import {
  REVEAL_CATCH_UP_MS,
  REVEAL_CHARS_PER_SEC,
  REVEAL_TICK_MS,
} from "../pacing";
import type { MessageState } from "../../reducer/models";

interface ActivityFrom {
  role?: string;
  id?: string;
  name?: string;
}

interface ChannelData {
  hasStreamExpired?: boolean;
  hasStreamReveal?: boolean;
  typingStyle?: string;
  state?: MessageState;
  [key: string]: unknown;
}

interface StreamEvent {
  type: string;
  [key: string]: unknown;
}

interface StreamEnvelope {
  runId: string;
  events: StreamEvent[];
}

interface Attachment {
  contentType: string;
  content: Record<string, unknown>;
}

interface Activity {
  id?: string;
  type?: string;
  text?: string;
  from: ActivityFrom;
  timestamp?: string;
  channelData: ChannelData;
  value?: { stream: StreamEnvelope };
  attachments?: Attachment[];
  [key: string]: unknown;
}

type ActivityInput = Partial<Omit<Activity, "value">> & {
  value?: { stream: StreamEnvelope };
  [key: string]: unknown;
};

interface DirectLineAction {
  type: string;
  payload: { activity: Activity };
}

interface ScheduledTimer {
  due: number;
  fn: () => void;
}

type Dispatch = (action: DirectLineAction) => DirectLineAction | undefined;

function createHarness({ replay = false }: { replay?: boolean } = {}) {
  const forwarded: DirectLineAction[] = [];

  let timerId = 0;
  let now = 1700000000000;
  const timers = new Map<number, ScheduledTimer>();

  const runDueTimers = (maxCallbacks: number): number => {
    let count = 0;
    while (timers.size && count < maxCallbacks) {
      let dueId: number | undefined;
      let dueTimer: ScheduledTimer | undefined;
      for (const [id, timer] of timers) {
        if (dueTimer === undefined || timer.due < dueTimer.due) {
          dueTimer = timer;
          dueId = id;
        }
      }
      if (dueId === undefined || dueTimer === undefined) {
        throw new Error("No due timer found");
      }
      timers.delete(dueId);
      if (dueTimer.due > now) {
        now = dueTimer.due;
      }
      count += 1;
      dueTimer.fn();
    }
    return count;
  };

  const SETTLE_BUDGET = 100000;
  const flush = (maxCallbacks?: number): void => {
    if (maxCallbacks === undefined) {
      runDueTimers(SETTLE_BUDGET);
      if (timers.size > 0) {
        throw new Error(
          `flush() did not settle: ${timers.size} timer(s) still pending`
        );
      }
      return;
    }
    runDueTimers(maxCallbacks);
  };

  const REVEAL_LOOKAHEAD_MS = 500;
  const flushReveals = () => {
    while (timers.size) {
      let dueId: number | undefined;
      let dueTimer: ScheduledTimer | undefined;
      for (const [id, timer] of timers) {
        if (dueTimer === undefined || timer.due < dueTimer.due) {
          dueTimer = timer;
          dueId = id;
        }
      }
      if (dueId === undefined || dueTimer === undefined) {
        throw new Error("No due timer found");
      }
      if (dueTimer.due > now + REVEAL_LOOKAHEAD_MS) {
        break;
      }
      timers.delete(dueId);
      if (dueTimer.due > now) {
        now = dueTimer.due;
      }
      dueTimer.fn();
    }
  };

  const advanceBy = (ms: number) => {
    const target = now + ms;
    for (;;) {
      let dueId: number | undefined;
      let dueTimer: ScheduledTimer | undefined;
      for (const [id, timer] of timers) {
        if (dueTimer === undefined || timer.due < dueTimer.due) {
          dueTimer = timer;
          dueId = id;
        }
      }
      if (dueId === undefined || dueTimer === undefined) {
        break;
      }
      if (dueTimer.due > target) {
        break;
      }
      timers.delete(dueId);
      if (dueTimer.due > now) {
        now = dueTimer.due;
      }
      dueTimer.fn();
    }
    now = target;
  };

  const fakeSetTimeout = (fn: () => void, delay = 0): number => {
    const id = ++timerId;
    timers.set(id, { due: now + delay, fn });
    return id;
  };
  const fakeClearTimeout = (id: number): void => {
    timers.delete(id);
  };

  const streaming = createController({
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout,
    now: () => now,
  });

  let dispatch: Dispatch;
  const store = {
    dispatch: (action: unknown) => dispatch(action as DirectLineAction),
  };
  dispatch = (action: DirectLineAction) => {
    if (action.type === "DIRECT_LINE/POST_ACTIVITY") {
      const outgoing = action.payload && action.payload.activity;
      if (
        outgoing &&
        (outgoing.type === "message" || outgoing.type === "invoke")
      ) {
        streaming.resetForNewTurn(store);
      }
    }
    if (action.type === "DIRECT_LINE/INCOMING_ACTIVITY") {
      const directive = streaming.handleIncoming(
        store,
        action.payload.activity
      );
      if (directive === "passthrough") {
        forwarded.push(action);
        return action;
      }
      if (directive === "swallow") {
        return undefined;
      }
      forwarded.push(action);
      return action;
    }
    forwarded.push(action);
    if (action.type === "DIRECT_LINE/QUEUE_INCOMING_ACTIVITY") {
      dispatch({
        type: "DIRECT_LINE/INCOMING_ACTIVITY",
        payload: { activity: action.payload.activity },
      });
    }
    return action;
  };

  const incoming = (activity: ActivityInput): DirectLineAction => {
    const action = {
      type: "DIRECT_LINE/INCOMING_ACTIVITY",
      payload: { activity },
    } as DirectLineAction;
    dispatch(action);
    return action;
  };

  const streamBatch = (
    events: StreamEvent[],
    runId = "run_1"
  ): DirectLineAction =>
    incoming({
      type: "message",
      from: { role: "bot" },
      value: { stream: { runId, events } },
    });

  const streamEvent = (event: StreamEvent, runId = "run_1"): DirectLineAction =>
    streamBatch([event], runId);

  const streamDelta = (delta: string, runId = "run_1"): DirectLineAction =>
    streamEvent(
      { type: "TEXT_MESSAGE_CONTENT", messageId: "msg_1", delta },
      runId
    );

  const sendUserMessage = () =>
    dispatch({
      type: "DIRECT_LINE/POST_ACTIVITY",
      payload: { activity: { type: "message", text: "Next turn" } },
    } as DirectLineAction);

  const revealFrames = () =>
    forwarded.filter(
      (a) =>
        a.payload.activity.channelData &&
        a.payload.activity.channelData.hasStreamReveal
    );
  const latestState = (): MessageState | undefined => {
    const frames = revealFrames();
    return frames.length
      ? frames[frames.length - 1].payload.activity.channelData?.state
      : undefined;
  };
  const stepLabels = () =>
    (latestState()?.reasoningSteps ?? []).map((step) => step.label);

  if (!replay) {
    sendUserMessage();
    forwarded.length = 0;
  }

  return {
    streaming,
    forwarded,
    incoming,
    streamBatch,
    streamEvent,
    streamDelta,
    sendUserMessage,
    flush,
    flushReveals,
    advanceBy,
    advanceTime: (ms: number) => {
      now += ms;
    },
    pendingTimers: () => timers.size,
    revealFrames,
    stepLabels,
    latestState,
  };
}

describe("stream detection", () => {
  it("has not seen a stream for a bot that only sends typing and messages", () => {
    const { streaming, incoming } = createHarness();
    incoming({ type: "typing" });
    expect(streaming.hasSeenStream()).toBe(false);
  });

  it("notifies once when the first stream frame arrives", () => {
    const { streaming, streamEvent } = createHarness();
    const listener = vi.fn();
    streaming.onFirstStream(listener);
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    expect(streaming.hasSeenStream()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("stops notifying after unsubscribe", () => {
    const { streaming, streamEvent } = createHarness();
    const listener = vi.fn();
    streaming.onFirstStream(listener)();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("batched stream activities", () => {
  it("applies every event of a batch in order and swallows the activity", () => {
    const { forwarded, streamBatch, latestState, flushReveals } =
      createHarness();
    const action = streamBatch([
      { type: "RUN_STARTED", runId: "run_1" },
      { type: "TEXT_MESSAGE_START", messageId: "msg_1" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "msg_1", delta: "Hi" },
      { type: "TEXT_MESSAGE_END", messageId: "msg_1" },
      { type: "RUN_FINISHED", runId: "run_1" },
    ]);
    expect(forwarded).not.toContain(action);
    flushReveals();
    expect(latestState()?.answerText).toBe("Hi");
  });

  it("notifies first-stream once for a multi-event frame", () => {
    const { streaming, streamBatch } = createHarness();
    const listener = vi.fn();
    streaming.onFirstStream(listener);
    streamBatch([
      { type: "RUN_STARTED", runId: "run_1" },
      { type: "TEXT_MESSAGE_START", messageId: "msg_1" },
    ]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("streaming typing indicator", () => {
  it("passes typing before a stream starts", () => {
    const { forwarded, incoming } = createHarness();
    const typing = incoming({ type: "typing" });
    expect(forwarded).toContain(typing);
  });

  it("suppresses typing while a stream is active", () => {
    const { forwarded, incoming, streamDelta } = createHarness();
    streamDelta("Thinking");
    const typing = incoming({ type: "typing" });
    expect(forwarded).not.toContain(typing);
  });

  it("resumes typing after the final bot activity", () => {
    const { forwarded, incoming, streamDelta } = createHarness();
    streamDelta("Answer");
    incoming({ type: "message", text: "Done", from: { role: "bot" } });
    const typing = incoming({ type: "typing" });
    expect(forwarded).toContain(typing);
  });

  it("resumes typing when a new outgoing turn resets stream state", () => {
    const { forwarded, incoming, streamDelta, sendUserMessage, flush } =
      createHarness();
    streamDelta("Answer");
    flush(4);
    sendUserMessage();
    flush(8);
    const typing = incoming({
      type: "typing",
      from: { role: "bot", id: "real-bot" },
    });
    expect(forwarded).toContain(typing);
  });
});

describe("streamed answer", () => {
  it("swallows the raw stream envelope and emits a local reveal frame", () => {
    const { forwarded, streamDelta, revealFrames } = createHarness();
    const frame = streamDelta("Hello world");
    expect(forwarded).not.toContain(frame);
    const frames = revealFrames();
    expect(frames.length > 0).toBeTruthy();
    const revealed = frames[0].payload.activity.text || "";
    expect(revealed.length > 0).toBeTruthy();
    expect("Hello world".startsWith(revealed)).toBeTruthy();
  });

  it("accumulates deltas across frames into the growing answer", () => {
    const { streamDelta, flushReveals, revealFrames } = createHarness();
    streamDelta("Hello ");
    flushReveals();
    streamDelta("world");
    flushReveals();
    const frames = revealFrames();
    expect(frames[frames.length - 1].payload.activity.text).toBe("Hello world");
  });

  it("reveals frames under the single streaming bubble id", () => {
    const { streamDelta, revealFrames } = createHarness();
    streamDelta("Answer text");
    expect(revealFrames()[0].payload.activity.id).toBe("has-stream-progress-1");
  });

  it("clears the previous answer buffer when the runId changes", () => {
    const { streamDelta, flushReveals, revealFrames } = createHarness();
    streamDelta("AAA", "run_1");
    flushReveals();
    streamDelta("BBBBBBBBBB", "run_2");
    flushReveals();
    const frames = revealFrames();
    const last = frames[frames.length - 1].payload.activity.text;
    expect(last).toBe("BBBBBBBBBB");
    expect(last).not.toContain("AAA");
  });

  it("clears the previous run's reasoning and answer state when the runId changes", () => {
    const { streamEvent, streamDelta, flushReveals, latestState } =
      createHarness();
    streamEvent(
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Searching run one" },
      },
      "run_1"
    );
    streamDelta("AAA", "run_1");
    flushReveals();

    streamEvent(
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-2",
        extensions: { toolProgress: "Searching run two" },
      },
      "run_2"
    );
    streamDelta("BBB", "run_2");
    flushReveals();

    const state = latestState();
    expect(state?.answerText).toBe("BBB");
    expect(state?.reasoningSteps.map((step) => step.label)).toEqual([
      "Searching run two",
    ]);
  });

  it("reconciles the final adaptive card onto the streamed bubble", () => {
    const {
      forwarded,
      incoming,
      streamEvent,
      streamDelta,
      flush,
      flushReveals,
      revealFrames,
    } = createHarness();
    streamDelta("Streaming answer");
    flushReveals();
    streamEvent({ type: "TEXT_MESSAGE_END", messageId: "msg_1" });
    streamEvent({ type: "RUN_FINISHED", runId: "run_1" });
    flushReveals();

    const frames = revealFrames();
    expect(frames[frames.length - 1].payload.activity.text).toBe(
      "Streaming answer"
    );

    const finalCard = incoming({
      type: "message",
      text: "Streaming answer",
      from: { role: "bot" },
      attachments: [
        { contentType: "application/vnd.microsoft.card.adaptive", content: {} },
      ],
    });
    flush(8);

    expect(forwarded).toContain(finalCard);
    expect(finalCard.payload.activity.id).toBe("has-stream-progress-1");
    expect(finalCard.payload.activity.text).toBe("Streaming answer");
    expect(finalCard.payload.activity.attachments).toEqual([
      { contentType: "application/vnd.microsoft.card.adaptive", content: {} },
    ]);
  });

  it("forwards the final ordinary bot message exactly once", () => {
    const { forwarded, incoming, streamDelta, flush, flushReveals } =
      createHarness();
    streamDelta("Answer");
    flushReveals();
    const finalCard = incoming({
      type: "message",
      text: "Answer",
      from: { role: "bot" },
    });
    flush(8);
    expect(forwarded.filter((a) => a === finalCard).length).toBe(1);
  });

  it("does not let pending reveal timers overwrite the final activity", () => {
    const { forwarded, incoming, streamDelta, flush } = createHarness();
    streamDelta("A long streamed answer that is still animating");
    const finalCard = incoming({
      type: "message",
      text: "A long streamed answer that is still animating",
      from: { role: "bot" },
    });
    flush(200);
    const finalIndex = forwarded.findIndex(
      (a) =>
        a.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
        a.payload.activity === finalCard.payload.activity
    );
    expect(finalIndex).toBeGreaterThan(-1);
    const laterReveal = forwarded
      .slice(finalIndex + 1)
      .some(
        (a) =>
          a.payload.activity.channelData &&
          a.payload.activity.channelData.hasStreamReveal
      );
    expect(laterReveal).toBeFalsy();
  });
});

describe("streamed progress (pre-answer events)", () => {
  it("does not render a tool call's raw tool name", () => {
    const { forwarded, streamEvent, flushReveals, revealFrames } =
      createHarness();
    const frame = streamEvent({
      type: "TOOL_CALL_START",
      toolCallName: "generate_answer",
    });
    flushReveals();
    expect(forwarded).not.toContain(frame);
    expect(revealFrames().length).toBe(0);
  });

  it("captures the tool progress intent as a reasoning step", () => {
    const { streamEvent, flushReveals, revealFrames, stepLabels } =
      createHarness();
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "generate_answer",
      extensions: { toolProgress: "Drafting a prior authorization note" },
    });
    flushReveals();
    expect(revealFrames().length > 0).toBeTruthy();
    expect(stepLabels()).toEqual(["Drafting a prior authorization note"]);
  });

  it('captures run start as an "Evaluating your request" step', () => {
    const { streamEvent, flushReveals, stepLabels } = createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    flushReveals();
    expect(stepLabels()).toEqual(["Evaluating your request"]);
  });

  it("does not gate the answer behind progress (answer streams immediately)", () => {
    const { streamEvent, streamDelta, flushReveals, revealFrames, stepLabels } =
      createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "medical_knowledge-run",
      extensions: { toolProgress: "Searching medical information" },
    });
    streamDelta("Final answer");
    flushReveals();

    const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
    expect(revealedTexts[revealedTexts.length - 1]).toBe("Final answer");
    expect(stepLabels()).toEqual([
      "Evaluating your request",
      "Searching medical information",
    ]);
  });

  it("captures every progress line as a reasoning step (parallel, none lost)", () => {
    const { streamEvent, flushReveals, stepLabels } = createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "first_tool",
      extensions: { toolProgress: "First pending tool" },
    });
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-2",
      toolCallName: "second_tool",
      extensions: { toolProgress: "Newest pending tool" },
    });
    flushReveals();
    expect(stepLabels()).toEqual([
      "Evaluating your request",
      "First pending tool",
      "Newest pending tool",
    ]);
  });

  it("suppresses duplicate external typing once stream refresh begins", () => {
    const { forwarded, incoming, streamEvent } = createHarness();
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "medical_knowledge-run",
      extensions: { toolProgress: "Searching medical information" },
    });
    const typing = incoming({ type: "typing" });
    expect(forwarded).not.toContain(typing);
  });

  it("replaces the progress line with the accumulating answer", () => {
    const { streamEvent, streamDelta, flushReveals, revealFrames } =
      createHarness();
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "medical_knowledge-run",
      extensions: { toolProgress: "Searching medical information" },
    });
    flushReveals();
    streamDelta("Final answer");
    flushReveals();
    const frames = revealFrames();
    expect(frames[frames.length - 1].payload.activity.text).toBe(
      "Final answer"
    );
  });

  it("does not render internal events as progress", () => {
    const { streamEvent, flushReveals, revealFrames } = createHarness();
    streamEvent({ type: "TOOL_CALL_START", toolCallName: "search" });
    streamEvent({ type: "TOOL_CALL_ARGS", delta: '{"a":1}' });
    streamEvent({ type: "TOOL_CALL_END", toolCallId: "tc-1" });
    streamEvent({ type: "TOOL_CALL_RESULT", toolCallId: "tc-1" });
    streamEvent({
      type: "CUSTOM",
      name: "safeguards",
      value: "Checking safeguards",
    });
    streamEvent({ type: "STATE_SNAPSHOT" });
    flushReveals();
    expect(revealFrames().length).toBe(0);
  });

  it("does not overwrite the answer with progress events received after answer start", () => {
    const { streamDelta, streamEvent, flushReveals, revealFrames } =
      createHarness();
    streamDelta("The answer");
    flushReveals();
    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-late",
      extensions: { toolProgress: "Late progress" },
    });
    flushReveals();
    const revealedTexts = revealFrames().map((a) => a.payload.activity.text);
    expect(revealedTexts).not.toContain("Late progress");
    expect(revealedTexts[revealedTexts.length - 1]).toBe("The answer");
  });
});

describe("error and reset", () => {
  it("does not forward the raw RUN_ERROR envelope", () => {
    const { forwarded, streamEvent } = createHarness();
    const errorFrame = streamEvent({
      type: "RUN_ERROR",
      runId: "run_1",
      value: "INTERNAL_SERVER_ERROR",
    });
    expect(forwarded).not.toContain(errorFrame);
  });

  it("lets the ordinary bot error activity replace the temporary bubble", () => {
    const { incoming, streamEvent } = createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    streamEvent({
      type: "RUN_ERROR",
      runId: "run_1",
      value: "INTERNAL_SERVER_ERROR",
    });
    const errorActivity = incoming({
      type: "message",
      text: "Something went wrong.",
      from: { role: "bot" },
    });
    expect(errorActivity.payload.activity.id).toBe("has-stream-progress-1");
  });

  it("resets stream ids so a new turn gets a fresh bubble id", () => {
    const { streamDelta, sendUserMessage, incoming, flushReveals } =
      createHarness();
    streamDelta("First");
    flushReveals();
    sendUserMessage();
    streamDelta("Second");
    const finalCard = incoming({
      type: "message",
      text: "Second",
      from: { role: "bot" },
    });
    expect(finalCard.payload.activity.id).toBe("has-stream-progress-2");
  });

  it("does not deliver stale timer callbacks from a previous turn", () => {
    const { streamDelta, sendUserMessage, flush, revealFrames } =
      createHarness();
    streamDelta("A partially revealed streamed answer");
    sendUserMessage();
    const revealCountAtReset = revealFrames().length;
    flush();
    expect(revealFrames().length).toBe(revealCountAtReset);
  });

  it("retires the previous bubble when a new turn starts before the final activity", () => {
    const { streamDelta, sendUserMessage, revealFrames } = createHarness();
    streamDelta("Partial answer from the first turn");
    sendUserMessage();
    const cleared = revealFrames().filter(
      (a) => a.payload.activity.channelData.hasStreamExpired
    );
    expect(cleared.length).toBe(1);
    const activity = cleared[cleared.length - 1].payload.activity;
    expect(activity.id).toBe("has-stream-progress-1");
    expect(activity.text).toBe("");
  });

  it("streamed tool output keeps a visible progress bubble alive", () => {
    const { streamEvent, advanceTime, flush, revealFrames } = createHarness();
    const startedAt = 1700000000000;
    const expiryWindowMs = 5 * 60 * 1000;

    streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      extensions: { toolProgress: "Reading the guideline" },
    });

    advanceTime(4 * 60 * 1000);
    streamEvent({
      type: "TOOL_CALL_STREAM",
      toolCallId: "tc-1",
      payload: { type: "DELTA", text: "still working" },
    });

    flush();
    const expired = revealFrames().filter(
      (a) => a.payload.activity.channelData.hasStreamExpired
    );
    expect(expired.length).toBe(1);
    expect(Date.parse(expired[0].payload.activity.timestamp as string)).toBe(
      startedAt + 4 * 60 * 1000 + expiryWindowMs
    );
  });

  it("reveals a shorter new answer after a runId change", () => {
    const { streamDelta, flushReveals, revealFrames } = createHarness();
    streamDelta("AAAAAAAAAA", "run_1");
    flushReveals();
    streamDelta("BBB", "run_2");
    flushReveals();
    const texts = revealFrames().map((a) => a.payload.activity.text);
    expect(texts[texts.length - 1]).toBe("BBB");
  });
});

describe("temporary bubble expiry", () => {
  it("retires the temporary bubble when no final activity ever arrives", () => {
    const {
      streamEvent,
      incoming,
      flush,
      flushReveals,
      advanceTime,
      revealFrames,
      forwarded,
    } = createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    flushReveals();

    advanceTime(5 * 60 * 1000);
    flush();

    const reveals = revealFrames();
    const expired = reveals[reveals.length - 1].payload.activity;
    expect(expired.text).toBe("");
    expect(expired.channelData.hasStreamExpired).toBe(true);

    const late = incoming({
      type: "message",
      text: "Late final",
      from: { role: "bot" },
    });
    expect(forwarded).toContain(late);
    expect(late.payload.activity.id).not.toBe("has-stream-progress-1");
  });

  it("keeps the bubble alive while progress and answer content keep arriving", () => {
    const {
      streamEvent,
      streamDelta,
      flush,
      flushReveals,
      advanceTime,
      revealFrames,
    } = createHarness();
    streamEvent({ type: "RUN_STARTED", runId: "run_1" });
    flushReveals();
    advanceTime(4 * 60 * 1000);
    streamDelta("Answer arriving in time");
    flushReveals();
    advanceTime(4 * 60 * 1000);

    const beforeDrain = revealFrames().map((a) => a.payload.activity.text);
    expect(beforeDrain[beforeDrain.length - 1]).toBe("Answer arriving in time");
    const expiredBeforeDrain = revealFrames().some(
      (a) => a.payload.activity.channelData.hasStreamExpired
    );
    expect(expiredBeforeDrain).toBeFalsy();

    flush();
    const afterDrain = revealFrames();
    expect(
      afterDrain[afterDrain.length - 1].payload.activity.channelData
        .hasStreamExpired
    ).toBe(true);
  });
});

describe("future compatibility (Option C boundary)", () => {
  it("swallows TOOL_CALL_CHUNK and does not render or corrupt the answer", () => {
    const { forwarded, streamEvent, streamDelta, flushReveals, revealFrames } =
      createHarness();
    const chunk = streamEvent({
      type: "TOOL_CALL_CHUNK",
      toolCallId: "tc-1",
      delta: "chunk text that must not render",
    });
    flushReveals();
    expect(forwarded).not.toContain(chunk);
    expect(revealFrames().length).toBe(0);

    streamDelta("Real answer");
    flushReveals();
    const frames = revealFrames();
    expect(frames[frames.length - 1].payload.activity.text).toBe("Real answer");
  });
});

describe("streaming pace", () => {
  type Harness = ReturnType<typeof createHarness>;

  const pacedFrames = (h: Harness) =>
    h
      .revealFrames()
      .filter(
        (a) =>
          a.payload.activity.timestamp &&
          !a.payload.activity.channelData.hasStreamExpired
      )
      .map((a) => ({
        at: Date.parse(a.payload.activity.timestamp as string),
        text: a.payload.activity.text ?? "",
        state: a.payload.activity.channelData.state as MessageState,
      }));

  const shownText = (h: Harness) => {
    const frames = pacedFrames(h);
    return frames.length ? frames[frames.length - 1].text : "";
  };

  const stepFor = (h: Harness, id: string) =>
    h.latestState()?.reasoningSteps.find((step) => step.id === id);

  const startStep = (h: Harness, id: string) =>
    h.streamEvent({
      type: "TOOL_CALL_START",
      toolCallId: id,
      extensions: { toolProgress: `Working on ${id}` },
    });

  const streamDetail = (h: Harness, id: string, text: string) =>
    h.streamEvent({
      type: "TOOL_CALL_STREAM",
      toolCallId: id,
      payload: { type: "DELTA", text },
    });

  const finalActivity = (h: Harness, text: string) =>
    h.incoming({ type: "message", text, from: { role: "bot" } });

  const timesForwarded = (h: Harness, final: DirectLineAction) =>
    h.forwarded.filter(
      (a) =>
        a.type === "DIRECT_LINE/INCOMING_ACTIVITY" &&
        a.payload.activity === final.payload.activity
    ).length;

  // rate = base + backlog / catch-up time, so the backlog decays toward -base * catch-up time.
  const baseBacklog = (REVEAL_CHARS_PER_SEC * REVEAL_CATCH_UP_MS) / 1000;
  const expectedShown = (total: number, ms: number) =>
    total -
    Math.max(
      0,
      (total + baseBacklog) *
        Math.exp(-(ms + REVEAL_TICK_MS) / REVEAL_CATCH_UP_MS) -
        baseBacklog
    );
  const msToReveal = (chars: number) =>
    Math.ceil(REVEAL_CATCH_UP_MS * Math.log(1 + chars / baseBacklog)) +
    4 * REVEAL_TICK_MS;

  describe("answer", () => {
    it("reveals a small burst at the steady base pace, never as a block", () => {
      const h = createHarness();
      h.streamDelta("x".repeat(100));
      expect(shownText(h).length).toBeGreaterThan(0);
      expect(shownText(h).length).toBeLessThanOrEqual(3);

      h.advanceBy(500);
      expect(shownText(h).length).toBeGreaterThanOrEqual(
        expectedShown(100, 500) - 3
      );
      expect(shownText(h).length).toBeLessThanOrEqual(
        expectedShown(100, 500) + 3
      );

      const frames = pacedFrames(h);
      for (let i = 1; i < frames.length; i += 1) {
        expect(
          frames[i].text.length - frames[i - 1].text.length
        ).toBeLessThanOrEqual(3);
      }
    });

    it("does not stall between ticks while a backlog exists", () => {
      const h = createHarness();
      h.streamDelta("y".repeat(60));
      h.advanceBy(400);
      h.streamDelta("z".repeat(60));
      h.advanceBy(2000);

      const frames = pacedFrames(h);
      expect(frames[frames.length - 1].text.length).toBe(120);
      for (let i = 1; i < frames.length; i += 1) {
        expect(frames[i].at - frames[i - 1].at).toBeLessThanOrEqual(
          REVEAL_TICK_MS
        );
      }
    });

    it("catches up on a large backlog smoothly and in bounded time", () => {
      const h = createHarness();
      const full = "w".repeat(3000);
      h.streamDelta(full);
      h.advanceBy(1000);
      expect(shownText(h).length).toBeGreaterThanOrEqual(
        expectedShown(full.length, 1000) - full.length / 100
      );
      expect(shownText(h).length).toBeLessThanOrEqual(
        expectedShown(full.length, 1000) + full.length / 100
      );

      h.advanceBy(msToReveal(full.length));
      expect(shownText(h)).toBe(full);

      const frames = pacedFrames(h);
      const increments = frames
        .slice(1)
        .map((f, i) => f.text.length - frames[i].text.length);
      for (let i = 1; i < increments.length; i += 1) {
        expect(increments[i]).toBeLessThanOrEqual(increments[i - 1] + 1);
      }
    });

    it("reveals in proportion to elapsed time when a tick is delayed", () => {
      const h = createHarness();
      h.streamDelta("d".repeat(100));
      h.advanceTime(500 - REVEAL_TICK_MS);
      h.advanceBy(REVEAL_TICK_MS);
      expect(shownText(h).length).toBeGreaterThanOrEqual(
        expectedShown(100, 500) - 3
      );
      expect(shownText(h).length).toBeLessThanOrEqual(100);
    });

    it("prints the final at once, even while the answer is still revealing", () => {
      const h = createHarness();
      const full = "f".repeat(2000);
      h.streamDelta(full);
      h.advanceBy(500);
      expect(shownText(h).length).toBeLessThan(full.length);

      const final = finalActivity(h, full);
      expect(timesForwarded(h, final)).toBe(1);
      expect(final.payload.activity.id).toBe("has-stream-progress-1");
      expect(final.payload.activity.channelData.state?.answerText).toBe(full);
      expect(h.pendingTimers()).toBe(0);

      const count = h.forwarded.length;
      h.flush();
      expect(h.forwarded.length).toBe(count);
    });

    it("prints the final at once with the complete thinking-step detail", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      const detail = "m".repeat(400);
      streamDetail(h, "tc-1", detail);
      h.streamEvent({ type: "TOOL_CALL_END", toolCallId: "tc-1" });
      h.streamDelta("The answer");

      const final = finalActivity(h, "The answer");
      expect(timesForwarded(h, final)).toBe(1);
      const step =
        final.payload.activity.channelData.state?.reasoningSteps.find(
          (s) => s.id === "tc-1"
        );
      expect(step?.detail).toBe(detail);
      expect(h.pendingTimers()).toBe(0);
    });

    it("forwards the bot's own final activity, so its suggested actions apply", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      streamDetail(h, "tc-1", "u".repeat(300));
      const final = finalActivity(h, "Done");

      expect(timesForwarded(h, final)).toBe(1);
      expect(
        h.forwarded.some(
          (a) => a.type === "DIRECT_LINE/QUEUE_INCOMING_ACTIVITY"
        )
      ).toBe(false);
    });

    it("forwards the final message immediately when no text is pending", () => {
      const h = createHarness();
      h.streamDelta("Short");
      h.flushReveals();
      const final = finalActivity(h, "Short");
      expect(h.forwarded).toContain(final);
    });
  });

  describe("reasoning steps", () => {
    it("paces streamed step detail at the steady pace", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      streamDetail(h, "tc-1", "r".repeat(100));
      expect(stepFor(h, "tc-1")?.detail.length ?? 0).toBeLessThanOrEqual(3);

      h.advanceBy(500);
      const len = stepFor(h, "tc-1")?.detail.length ?? 0;
      expect(len).toBeGreaterThanOrEqual(expectedShown(100, 500) - 3);
      expect(len).toBeLessThanOrEqual(expectedShown(100, 500) + 3);
    });

    it("paces parallel steps independently", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      startStep(h, "tc-2");
      streamDetail(h, "tc-1", "a".repeat(100));
      streamDetail(h, "tc-2", "b".repeat(100));
      h.advanceBy(500);

      const active = stepFor(h, "tc-2")?.detail.length ?? 0;
      expect(active).toBeGreaterThanOrEqual(expectedShown(100, 500) - 3);
      expect(active).toBeLessThanOrEqual(expectedShown(100, 500) + 3);
      expect(stepFor(h, "tc-1")?.detail.length ?? 0).toBeGreaterThanOrEqual(
        expectedShown(100, 500) - 3
      );

      h.advanceBy(msToReveal(100));
      expect(stepFor(h, "tc-1")?.detail).toBe("a".repeat(100));
      expect(stepFor(h, "tc-1")?.status).toBe("done");
    });

    it("holds a step's done status until its detail has finished revealing", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      const detail = "c".repeat(300);
      streamDetail(h, "tc-1", detail);
      h.streamEvent({ type: "TOOL_CALL_END", toolCallId: "tc-1" });
      expect(stepFor(h, "tc-1")?.status).toBe("active");

      h.advanceBy(msToReveal(detail.length));
      expect(stepFor(h, "tc-1")?.detail).toBe(detail);
      expect(stepFor(h, "tc-1")?.status).toBe("done");

      for (const frame of pacedFrames(h)) {
        const step = frame.state.reasoningSteps.find((s) => s.id === "tc-1");
        if (step?.status === "done") {
          expect(step.detail).toBe(detail);
        }
      }
    });

    it("keeps revealing leftover step detail after the answer starts", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      const detail = "e".repeat(1000);
      streamDetail(h, "tc-1", detail);
      h.advanceBy(100);
      h.streamDelta("The answer");
      expect(stepFor(h, "tc-1")?.detail.length ?? 0).toBeLessThan(
        detail.length
      );

      h.advanceBy(msToReveal(detail.length));
      expect(stepFor(h, "tc-1")?.detail).toBe(detail);
    });
  });

  describe("interruptions", () => {
    it("shows all pending answer text immediately when the run errors", () => {
      const h = createHarness();
      const full = "q".repeat(300);
      h.streamDelta(full);
      h.advanceBy(100);
      h.streamEvent({ type: "RUN_ERROR", runId: "run_1" });
      expect(shownText(h)).toBe(full);

      const count = h.revealFrames().length;
      h.advanceBy(1000);
      expect(h.revealFrames().length).toBe(count);
    });

    it("shows all pending step detail immediately when the run errors before the answer", () => {
      const h = createHarness();
      startStep(h, "tc-1");
      const detail = "k".repeat(300);
      streamDetail(h, "tc-1", detail);
      h.advanceBy(100);
      h.streamEvent({ type: "RUN_ERROR", runId: "run_1" });

      const step = stepFor(h, "tc-1");
      expect(step?.detail).toBe(detail);
      expect(step?.status).toBe("done");
      expect(h.latestState()?.variant).toBe("progress");
    });

    it("restarts the reveal cleanly when the run restarts", () => {
      const h = createHarness();
      h.streamDelta("o".repeat(300), "run_1");
      h.advanceBy(100);
      h.streamDelta("p".repeat(100), "run_2");
      h.advanceBy(2000);
      expect(shownText(h)).toBe("p".repeat(100));
    });

    it("leaves no reveal timers behind once the bubble expires", () => {
      const h = createHarness();
      h.streamDelta("t".repeat(50));
      h.flush();
      expect(h.pendingTimers()).toBe(0);
      const last = h.revealFrames().at(-1)?.payload.activity;
      expect(last?.channelData.hasStreamExpired).toBe(true);
    });
  });
});

describe("reopened Web Chat (history replayed by Direct Line)", () => {
  const replayAnswer = (
    h: ReturnType<typeof createHarness>,
    runId: string,
    text: string
  ) => {
    h.streamEvent({ type: "RUN_STARTED" }, runId);
    h.streamEvent(
      {
        type: "TOOL_CALL_START",
        toolCallId: `${runId}-tool`,
        extensions: { toolProgress: "Searching" },
      },
      runId
    );
    h.streamEvent(
      { type: "TOOL_CALL_END", toolCallId: `${runId}-tool` },
      runId
    );
    h.streamDelta(text, runId);
    return h.incoming({ type: "message", text, from: { role: "bot" } });
  };

  it("shows a replayed answer complete, with no streaming bubble or pacing", () => {
    const h = createHarness({ replay: true });
    const text = "r".repeat(2000);
    const final = replayAnswer(h, "run_old", text);

    expect(h.revealFrames()).toHaveLength(0);
    expect(timesForwardedOf(h, final)).toBe(1);
    expect(final.payload.activity.channelData.state?.answerText).toBe(text);
    expect(
      final.payload.activity.channelData.state?.reasoningSteps.length
    ).toBeGreaterThan(0);
    expect(h.pendingTimers()).toBe(0);
  });

  it("gives every replayed answer its own bubble, so none replaces another", () => {
    const h = createHarness({ replay: true });
    const first = replayAnswer(h, "run_a", "First answer");
    const second = replayAnswer(h, "run_b", "Second answer");

    expect(first.payload.activity.id).not.toBe(second.payload.activity.id);
    expect(second.payload.activity.channelData.state?.answerText).toBe(
      "Second answer"
    );
  });

  it("streams a new answer normally after the user sends a message", () => {
    const h = createHarness({ replay: true });
    const old = replayAnswer(h, "run_old", "Old answer");

    h.sendUserMessage();
    h.streamDelta("x".repeat(500), "run_new");
    const live = h.revealFrames().at(-1)!.payload.activity;
    expect(live.id).not.toBe(old.payload.activity.id);
    expect((live.text ?? "").length).toBeLessThan(500);
  });
});

const timesForwardedOf = (
  h: ReturnType<typeof createHarness>,
  action: DirectLineAction
) =>
  h.forwarded.filter((a) => a.payload.activity === action.payload.activity)
    .length;
