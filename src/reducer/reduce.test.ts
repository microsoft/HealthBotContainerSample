import { describe, it, expect } from "vitest";
import { createInitialMessageState, type MessageState } from "./models";
import { interpretEvent } from "./interpret";
import type { AnyAguiEvent } from "./models";
import { reduceEvent } from "./reduce";

function reduceAll(events: AnyAguiEvent[], start?: MessageState): MessageState {
  return events.reduce(
    (acc, event) => reduceEvent(acc, event).state,
    start ?? createInitialMessageState()
  );
}

describe("interpretEvent", () => {
  it("maps RUN_STARTED to a safe progress line", () => {
    const result = interpretEvent({ type: "RUN_STARTED", runId: "run_1" });
    expect(result.progressText).toBe("Evaluating your request");
    expect(result.answerDelta).toBe("");
  });

  it("surfaces the injected tool progress, never the raw tool name", () => {
    const result = interpretEvent({
      type: "TOOL_CALL_START",
      toolCallId: "tc-1",
      toolCallName: "medical_knowledge-run",
      extensions: { toolProgress: "Looking up side effects" },
    });
    expect(result.progressText).toBe("Looking up side effects");
    expect(result.answerDelta).toBe("");
  });

  it("yields no progress for a tool call without an injected progress line", () => {
    const result = interpretEvent({
      type: "TOOL_CALL_START",
      toolCallName: "search",
    });
    expect(result.progressText).toBe("");
  });

  it("maps TEXT_MESSAGE_CONTENT.delta to answer text", () => {
    const result = interpretEvent({
      type: "TEXT_MESSAGE_CONTENT",
      delta: "Hello",
    });
    expect(result.answerDelta).toBe("Hello");
    expect(result.progressText).toBe("");
  });

  it("ignores a non-string delta (hardening against malformed input)", () => {
    expect(
      interpretEvent({
        type: "TEXT_MESSAGE_CONTENT",
        delta: { a: 1 },
      } as AnyAguiEvent).answerDelta
    ).toBe("");
    expect(
      interpretEvent({
        type: "TEXT_MESSAGE_CONTENT",
        delta: 42,
      } as AnyAguiEvent).answerDelta
    ).toBe("");
  });

  it("safe default: an unknown event type is ignored, never throws", () => {
    const result = interpretEvent({
      type: "SOME_FUTURE_EVENT",
      foo: "bar",
    } as AnyAguiEvent);
    expect(result.progressText).toBe("");
    expect(result.answerDelta).toBe("");
  });
});

describe("reduceEvent — parity events", () => {
  it("RUN_STARTED seeds the opening reasoning step", () => {
    const state = reduceAll([{ type: "RUN_STARTED", runId: "r1" }]);
    expect(state.variant).toBe("progress");
    expect(state.avatarState).toBe("thinking");
    expect(state.reasoningSteps.map((s) => s.label)).toEqual([
      "Evaluating your request",
    ]);
  });

  it("TOOL_CALL_START appends a step with the injected progress label", () => {
    const state = reduceAll([
      { type: "RUN_STARTED" },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Searching guidelines" },
      },
    ]);
    const labels = state.reasoningSteps.map((s) => s.label);
    expect(labels).toContain("Searching guidelines");
    const step = state.reasoningSteps.find((s) => s.id === "tc-1");
    expect(step?.status).toBe("active");
  });

  it("TOOL_CALL_END settles only its own step to done", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "A" },
      },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-2",
        extensions: { toolProgress: "B" },
      },
      { type: "TOOL_CALL_END", toolCallId: "tc-2" },
    ]);
    const byId = Object.fromEntries(
      state.reasoningSteps.map((s) => [s.id, s.status])
    );
    expect(byId["tc-2"]).toBe("done");
  });

  it("TEXT_MESSAGE_CONTENT accumulates answer text and flips to the answer variant", () => {
    const state = reduceAll([
      { type: "RUN_STARTED" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "Hel" },
      { type: "TEXT_MESSAGE_CONTENT", delta: "lo" },
    ]);
    expect(state.variant).toBe("answer");
    expect(state.answerText).toBe("Hello");
  });

  it("RUN_ERROR flips to the error variant and retires reasoning", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "A" },
      },
      { type: "RUN_ERROR", message: "boom" },
    ]);
    expect(state.variant).toBe("error");
    expect(state.avatarState).toBe("done");
    expect(state.reasoningSteps.every((s) => s.status === "done")).toBe(true);
  });

  it("an unknown event leaves state unchanged", () => {
    const before = reduceAll([{ type: "RUN_STARTED" }]);
    const after = reduceEvent(before, {
      type: "MYSTERY",
    } as AnyAguiEvent).state;
    expect(after).toEqual(before);
  });
});

describe("reduceEvent — newly wired AG-UI events", () => {
  it("TOOL_CALL_STREAM DELTA streams text into the matching step detail", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Reading" },
      },
      {
        type: "TOOL_CALL_STREAM",
        toolCallId: "tc-1",
        payload: { type: "DELTA", text: "Line 1\n" },
      },
      {
        type: "TOOL_CALL_STREAM",
        toolCallId: "tc-1",
        payload: { type: "DELTA", text: "Line 2" },
      },
    ]);
    const step = state.reasoningSteps.find((s) => s.id === "tc-1");
    expect(step?.detail).toBe("Line 1\nLine 2");
  });

  it("TOOL_CALL_STREAM DELTA with empty text is a no-op", () => {
    const before = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Reading" },
      },
    ]);
    const after = reduceEvent(before, {
      type: "TOOL_CALL_STREAM",
      toolCallId: "tc-1",
      payload: { type: "DELTA", text: "" },
    }).state;
    expect(after).toBe(before);
  });

  it("TOOL_CALL_STREAM CUSTOM captures structured sources on the step", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Searching" },
      },
      {
        type: "TOOL_CALL_STREAM",
        toolCallId: "tc-1",
        payload: { type: "CUSTOM", name: "sources_found", data: { count: 3 } },
      },
    ]);
    const step = state.reasoningSteps.find((s) => s.id === "tc-1");
    expect(step?.sources).toHaveLength(1);
    expect(step?.sources[0].name).toBe("sources_found");
    expect(step?.sources[0].data).toEqual({ count: 3 });
  });

  it("TOOL_CALL_STREAM CUSTOM without a name is a no-op", () => {
    const before = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "Searching" },
      },
    ]);
    const after = reduceEvent(before, {
      type: "TOOL_CALL_STREAM",
      toolCallId: "tc-1",
      payload: { type: "CUSTOM", data: { x: 1 } },
    }).state;
    expect(after).toBe(before);
  });

  it("a fallback TOOL_CALL_START replaces the named step in place (no duplicate)", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "First attempt" },
      },
      {
        type: "TOOL_CALL_STREAM",
        toolCallId: "tc-1",
        payload: { type: "DELTA", text: "partial" },
      },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-2",
        extensions: {
          toolProgress: "Retrying",
          isFallback: true,
          replacedToolCallId: "tc-1",
        },
      },
    ]);
    const retried = state.reasoningSteps.find((s) => s.label === "Retrying");
    expect(
      state.reasoningSteps.filter((s) => s.label === "Retrying")
    ).toHaveLength(1);
    expect(retried?.id).toBe("tc-2");
    expect(retried?.status).toBe("active");
    expect(retried?.detail).toBe("");
    expect(state.reasoningSteps.some((s) => s.id === "tc-1")).toBe(false);
  });

  it("later DELTA after a fallback maps to the re-keyed step", () => {
    const state = reduceAll([
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-1",
        extensions: { toolProgress: "First" },
      },
      {
        type: "TOOL_CALL_START",
        toolCallId: "tc-2",
        extensions: {
          toolProgress: "Retry",
          isFallback: true,
          replacedToolCallId: "tc-1",
        },
      },
      {
        type: "TOOL_CALL_STREAM",
        toolCallId: "tc-2",
        payload: { type: "DELTA", text: "ok" },
      },
    ]);
    const step = state.reasoningSteps.find((s) => s.id === "tc-2");
    expect(step?.detail).toBe("ok");
  });
});
