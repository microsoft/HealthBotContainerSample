import { INCOMING_ACTIVITY, MESSAGE, POST_ACTIVITY } from "../wire";
import type { WebChatAction, WebChatStore } from "../wire";
import { DEBOUNCE_DELAY_MS } from "./models";
import type { StreamingMiddlewareOptions } from "./models";

// Normalise to a value tree first and stringify once. Stringifying nested values on the way
// down would make {a:{x:1}} and {a:"{\"x\":1}"} produce the same key, so one of two distinct
// card actions could be dropped inside the debounce window.
function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalizeValue);
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  const source = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    normalized[key] = normalizeValue(source[key]);
  }
  return normalized;
}

function createDeterministicKey(value: unknown): string {
  return JSON.stringify(normalizeValue(value)) ?? String(value);
}

export function createStreamingMiddleware({
  streaming,
  locale,
}: StreamingMiddlewareOptions) {
  let lastButtonTime = 0;
  let lastButtonKey: string | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return (store: WebChatStore) =>
    (next: (action: WebChatAction) => unknown) =>
    (action: WebChatAction): unknown => {
      const activity = action.payload?.activity;

      if (action.type === POST_ACTIVITY) {
        if (
          activity &&
          (activity.type === MESSAGE || activity.type === "invoke")
        ) {
          streaming.resetForNewTurn(store);
        }

        // Gate on a truthy value: a typed message may carry value null/"" and must not be debounced.
        if (activity?.type === MESSAGE && activity.value) {
          const now = Date.now();
          const key = createDeterministicKey(activity.value);
          if (
            now - lastButtonTime < DEBOUNCE_DELAY_MS &&
            lastButtonKey === key
          ) {
            return undefined;
          }
          lastButtonTime = now;
          lastButtonKey = key;
          if (debounceTimer) {
            clearTimeout(debounceTimer);
          }
          debounceTimer = setTimeout(() => {
            lastButtonKey = null;
            debounceTimer = null;
          }, DEBOUNCE_DELAY_MS);
        }

        if (activity?.type === MESSAGE && activity.from?.role === "user") {
          locale.tagUserActivity(activity);
        }

        return next(action);
      }

      if (action.type === INCOMING_ACTIVITY) {
        if (
          activity?.type === MESSAGE &&
          activity.from?.role === "bot" &&
          activity.locale
        ) {
          locale.setFromBot(activity.locale);
        }

        const directive = streaming.handleIncoming(store, activity);
        if (directive === "swallow") {
          return undefined;
        }
        return next(action);
      }

      return next(action);
    };
}
