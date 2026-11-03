import { describe, it, expect } from "vitest";
import { parseStreamEnvelope, isStreamFrame } from "./parseEnvelope";

const streamActivity = (event: unknown, runId = "run_1") => ({
  type: "message",
  from: { role: "bot" },
  value: { stream: { runId, events: [event] } },
});

const batchActivity = (events: unknown, runId = "run_1") => ({
  type: "message",
  from: { role: "bot" },
  value: { stream: { runId, events } },
});

describe("parseStreamEnvelope", () => {
  it("extracts the typed event and stream id from a stream activity", () => {
    const frame = parseStreamEnvelope(
      streamActivity({ type: "RUN_STARTED", runId: "r1" })
    );
    expect(frame?.runId).toBe("run_1");
    expect(frame?.events.map((e) => e.type)).toEqual(["RUN_STARTED"]);
  });

  it("returns every event of a batch, in order", () => {
    const events = [
      { type: "TEXT_MESSAGE_START", messageId: "m1" },
      { type: "TEXT_MESSAGE_CONTENT", messageId: "m1", delta: "Hi" },
      { type: "TEXT_MESSAGE_END", messageId: "m1" },
    ];
    expect(parseStreamEnvelope(batchActivity(events))?.events).toEqual(events);
  });

  it.each([
    ["empty", []],
    ["not an array", { type: "RUN_STARTED" }],
    ["holding an event with no string type", [{ type: "RUN_STARTED" }, {}]],
    ["holding a non-object event", [{ type: "RUN_STARTED" }, "RUN_ERROR"]],
  ])("returns null for a batch that is %s", (_label, events) => {
    expect(parseStreamEnvelope(batchActivity(events))).toBeNull();
  });

  it("accepts the legacy single-event envelope as a batch of one", () => {
    const frame = parseStreamEnvelope({
      type: "message",
      value: { stream: { runId: "run_1", event: { type: "RUN_STARTED" } } },
    });
    expect(frame?.events).toEqual([{ type: "RUN_STARTED" }]);
  });

  it("returns null for a plain (non-stream) message", () => {
    expect(parseStreamEnvelope({ type: "message", text: "hi" })).toBeNull();
  });

  it("returns null for a non-message activity", () => {
    expect(parseStreamEnvelope({ type: "typing" })).toBeNull();
  });

  it("returns null when the event has no string type", () => {
    expect(parseStreamEnvelope(streamActivity({ foo: "bar" }))).toBeNull();
  });

  it("never throws on malformed input", () => {
    expect(parseStreamEnvelope(null)).toBeNull();
    expect(parseStreamEnvelope(undefined)).toBeNull();
    expect(parseStreamEnvelope(42)).toBeNull();
    expect(
      parseStreamEnvelope({ type: "message", value: { stream: "nope" } })
    ).toBeNull();
  });
});

describe("isStreamFrame", () => {
  it("is true for a message carrying a stream payload, even if the event is malformed", () => {
    expect(isStreamFrame(streamActivity({ foo: "bar" }))).toBe(true);
    expect(isStreamFrame({ type: "message", value: { stream: {} } })).toBe(
      true
    );
  });

  it("is false for a plain message or a non-message activity", () => {
    expect(isStreamFrame({ type: "message", text: "hi" })).toBe(false);
    expect(isStreamFrame({ type: "typing" })).toBe(false);
    expect(isStreamFrame(null)).toBe(false);
  });
});
