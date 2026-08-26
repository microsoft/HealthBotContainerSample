// Activity middleware: the render seam where the redesigned chat plugs into Web Chat.
//
// Responsibilities:
//   1. Hide the retired temporary streaming bubble. When the placeholder expires without
//      a final activity, streaming.ts emits a same-id frame flagged `hasStreamExpired`;
//      rendering nothing makes the stale bubble disappear instead of lingering.
//   2. Route SYNTHETIC streaming reveal frames through <Message>. Those carry
//      `channelData.hasStreamReveal` and the id "has-stream-progress-<n>" (also their key
//      in messageStore); the progress variant renders the redesigned thinking card (A1
//      chip + F2 rail), while other variants still delegate to Web Chat's default render.
//   3. F1 — collapsible thinking history above the answer. The authoritative final bot
//      activity is given the same id (streaming.ts forward-final) but does NOT carry
//      hasStreamReveal, so it renders via Web Chat's default. When messageStore still
//      holds that turn's reasoning trace, we render a collapsed <ReasoningDisclosure>
//      ABOVE the default answer so the full ordered trace is available on demand.
//
// It also shows how to customize Web Chat rendering without forking its source.
import type { ReactNode } from 'react';
import { Message } from './Message';
import { ReasoningDisclosure } from './ReasoningDisclosure';
import { messageStore } from '../agui/messageStore';

// Web Chat's legacy activity middleware contract (see botframework-webchat-api
// LegacyActivityBridge): each middleware receives `next` and the activity card, and must
// return EITHER `false` (hide the activity) OR a *render function* of the shape
// `(renderAttachment, options) => ReactNode`. Web Chat later CALLS that render function —
// so a middleware must never return a React element directly, or Web Chat throws
// "render is not a function". `next(...args)` yields the downstream render function (or
// false); to render the default bubble we call it with the same (renderAttachment, options).
type LegacyRenderFunction = (renderAttachment: unknown, options: unknown) => ReactNode;
type RenderResult = LegacyRenderFunction | false;
type NextFn = (...args: unknown[]) => RenderResult;

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

function streamActivityId(card: ActivityCard | undefined): string | undefined {
  const id = card?.activity?.id;
  return typeof id === 'string' && id.startsWith(STREAM_ACTIVITY_ID_PREFIX) ? id : undefined;
}

// Only the SYNTHETIC progress/answer reveal frames the controller emits are eligible for
// structured rendering. Those carry `channelData.hasStreamReveal` (see streaming.ts).
// The authoritative final bot activity is deliberately given the same id so it replaces
// the progress bubble (streaming.ts forward-final), but it does NOT carry hasStreamReveal
// — so it always falls through to Web Chat's default render. Gating on the flag (not the
// id prefix alone) is what stops a variant from swallowing the reconciled final message
// (its server-formatted text, rich cards, and final-only citations).
function isStreamingActivity(card: ActivityCard | undefined): boolean {
  return Boolean(card?.activity?.channelData?.hasStreamReveal === true && streamActivityId(card));
}

export const activityMiddleware =
  () =>
  (next: NextFn) =>
  (...renderArgs: unknown[]): RenderResult => {
    const card = renderArgs[0] as ActivityCard | undefined;

    if (card?.activity?.channelData?.hasStreamExpired) {
      return false;
    }

    // Downstream render function (Web Chat's default bubble, or false to hide). We compose
    // it once and forward its (renderAttachment, options) so our wrappers render on top of
    // the real default rather than replacing it.
    const renderNext = next(...renderArgs);
    const renderDefaultWith: LegacyRenderFunction = (renderAttachment, options) =>
      typeof renderNext === 'function' ? renderNext(renderAttachment, options) : null;

    if (isStreamingActivity(card)) {
      const activityId = streamActivityId(card) as string;
      return (renderAttachment, options) => (
        <Message
          activityId={activityId}
          renderDefault={() => renderDefaultWith(renderAttachment, options)}
        />
      );
    }

    // F1: the reconciled final answer keeps the streaming id but has no hasStreamReveal
    // flag. If its turn's reasoning trace is still in the store, show it collapsed above
    // the default answer bubble. (One-time read at render — the trace is complete by the
    // time the final message lands, so no live subscription is needed here.)
    const finalId = streamActivityId(card);
    if (finalId) {
      const state = messageStore.getSnapshot(finalId);
      if (state && state.reasoningSteps.length > 0) {
        return (renderAttachment, options) => (
          <>
            <ReasoningDisclosure steps={state.reasoningSteps} variant="history" />
            {renderDefaultWith(renderAttachment, options)}
          </>
        );
      }
    }

    return renderNext;
  };
