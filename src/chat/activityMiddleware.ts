// Activity middleware: hide the retired temporary streaming bubble.
//
// When the placeholder expires without a final activity, streaming.ts emits a same-id
// frame flagged `hasStreamExpired`; rendering nothing makes the stale bubble disappear
// instead of lingering on screen. It also shows how to customize Web Chat rendering
// without forking its source.
type RenderFn = (...args: unknown[]) => unknown;

interface ActivityCard {
  activity?: {
    channelData?: {
      hasStreamExpired?: boolean;
    };
  };
}

export const activityMiddleware =
  () =>
  (next: RenderFn) =>
  (...renderArgs: unknown[]): unknown => {
    const card = renderArgs[0] as ActivityCard | undefined;
    if (card && card.activity && card.activity.channelData && card.activity.channelData.hasStreamExpired) {
      return false;
    }
    return next(...renderArgs);
  };
