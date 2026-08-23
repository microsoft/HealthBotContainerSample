// Activity middleware: the render seam where the redesigned <Message> plugs into Web Chat.
//
// Two responsibilities:
//   1. Hide the retired temporary streaming bubble. When the placeholder expires without
//      a final activity, streaming.ts emits a same-id frame flagged `hasStreamExpired`;
//      rendering nothing makes the stale bubble disappear instead of lingering.
//   2. Route streaming bubbles through <Message>. Every streaming activity carries the
//      id "has-stream-progress-<n>" (also its key in messageStore), so we wrap those in
//      <Message>, which subscribes the bubble to its live MessageState. In this
//      foundation <Message> delegates back to Web Chat's default render, so the UX is
//      unchanged (Q5) — but the structured spine now runs end-to-end and each redesign
//      feature can light up a variant without touching this file.
//
// It also shows how to customize Web Chat rendering without forking its source.
import type { ReactNode } from 'react';
import { Message } from './Message';

type RenderFn = (...args: unknown[]) => ReactNode;

/** Streaming bubbles are keyed "has-stream-progress-<n>" (see streaming.ts). */
const STREAM_ACTIVITY_ID_PREFIX = 'has-stream-progress-';

interface ActivityCard {
  activity?: {
    id?: string;
    channelData?: {
      hasStreamReveal?: boolean;
      hasStreamExpired?: boolean;
    };
  };
}

// Only the SYNTHETIC progress/answer reveal frames the controller emits are eligible for
// structured rendering. Those carry `channelData.hasStreamReveal` (see streaming.ts).
// The authoritative final bot activity is deliberately given the same id so it replaces
// the progress bubble (streaming.ts forward-final), but it does NOT carry hasStreamReveal
// — so it always falls through to Web Chat's default render. Gating on the flag (not the
// id prefix alone) is what stops a future variant from swallowing the reconciled final
// message (its server-formatted text, rich cards, and final-only citations).
function isStreamingActivity(card: ActivityCard | undefined): boolean {
  return Boolean(
    card && card.activity
      && card.activity.channelData && card.activity.channelData.hasStreamReveal === true
      && typeof card.activity.id === 'string'
      && card.activity.id.startsWith(STREAM_ACTIVITY_ID_PREFIX),
  );
}

export const activityMiddleware =
  () =>
  (next: RenderFn) =>
  (...renderArgs: unknown[]): ReactNode => {
    const card = renderArgs[0] as ActivityCard | undefined;

    if (card && card.activity && card.activity.channelData && card.activity.channelData.hasStreamExpired) {
      return false;
    }

    if (isStreamingActivity(card)) {
      const activityId = (card as ActivityCard).activity!.id as string;
      return <Message activityId={activityId} renderDefault={() => next(...renderArgs)} />;
    }

    return next(...renderArgs);
  };
