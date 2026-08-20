/*
 * Typed extraction of an AG-UI event from a Direct Line activity.
 *
 * Health Bot forwards every Orchestrator AG-UI event to the browser as a durable
 * Direct Line message activity shaped like:
 *
 *   { type: "message", value: { stream: { streamId, event: { type, ... } } } }
 *
 * parseStreamEnvelope() is the single point that understands this transport shape.
 * It accepts an untyped activity (activities arrive from several sources) and returns
 * the stream id + typed event only when the activity actually carries one, or null.
 * Keeping this here means the controller never reaches into `activity.value.stream`
 * by hand and the camelCase contract lives in exactly one place.
 */

import type { AnyAguiEvent } from './registry.ts';

/** The `stream` object Health Bot places on a streaming message activity. */
export interface StreamEnvelope {
  streamId?: string;
  event?: AnyAguiEvent;
}

/** A successfully extracted stream frame: a guaranteed event plus its stream id. */
export interface ParsedStreamFrame {
  streamId?: string;
  event: AnyAguiEvent;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Extract the AG-UI stream frame from a Direct Line activity, or null if the activity
 * is not a streaming message frame. Never throws on malformed input.
 */
export function parseStreamEnvelope(activity: unknown): ParsedStreamFrame | null {
  if (!isRecord(activity) || activity.type !== 'message') {
    return null;
  }

  const value = activity.value;
  if (!isRecord(value)) {
    return null;
  }

  const stream = value.stream;
  if (!isRecord(stream) || !isRecord(stream.event)) {
    return null;
  }

  const event = stream.event as AnyAguiEvent;
  if (typeof event.type !== 'string') {
    return null;
  }

  const streamId = typeof stream.streamId === 'string' ? stream.streamId : undefined;
  return { streamId, event };
}

/**
 * True if the activity is a message carrying a stream payload, regardless of whether
 * its event is well-formed. The controller uses this to swallow a malformed stream
 * frame instead of mistaking it for the authoritative final bot message. Never throws.
 */
export function isStreamFrame(activity: unknown): boolean {
  return (
    isRecord(activity) &&
    activity.type === 'message' &&
    isRecord(activity.value) &&
    isRecord(activity.value.stream)
  );
}
