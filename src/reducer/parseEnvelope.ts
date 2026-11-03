import type { AnyAguiEvent, ParsedStreamFrame } from "./models";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseEvent(value: unknown): AnyAguiEvent | null {
  if (!isRecord(value) || typeof value.type !== "string") {
    return null;
  }
  return value as AnyAguiEvent;
}

function parseEvents(stream: Record<string, unknown>): AnyAguiEvent[] | null {
  // Bots built before event batching send a single `event`; treat it as a batch of one.
  const raw = "events" in stream ? stream.events : [stream.event];
  if (!Array.isArray(raw) || raw.length === 0) {
    return null;
  }

  const events: AnyAguiEvent[] = [];
  for (const item of raw) {
    const event = parseEvent(item);
    if (!event) {
      return null;
    }
    events.push(event);
  }
  return events;
}

export function parseStreamEnvelope(
  activity: unknown
): ParsedStreamFrame | null {
  if (!isRecord(activity) || activity.type !== "message") {
    return null;
  }

  const value = activity.value;
  if (!isRecord(value)) {
    return null;
  }

  const stream = value.stream;
  if (!isRecord(stream)) {
    return null;
  }

  const events = parseEvents(stream);
  if (!events) {
    return null;
  }

  const runId = typeof stream.runId === "string" ? stream.runId : undefined;
  return { runId, events };
}

export function isStreamFrame(activity: unknown): boolean {
  return (
    isRecord(activity) &&
    activity.type === "message" &&
    isRecord(activity.value) &&
    isRecord((activity.value as Record<string, unknown>).stream)
  );
}
