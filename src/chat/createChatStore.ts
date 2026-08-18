import { createStore, createStoreWithDevTools } from 'botframework-webchat';
import type { GeoLocation, User } from '../types';
import type { StreamController, WebChatStore } from '../streaming';

interface CreateChatStoreOptions {
  streaming: StreamController;
  user: User;
  jsonWebToken: string;
  requestLocation: (callback: (location?: GeoLocation) => void) => void;
  // Enable the experimental Redux DevTools store (dev only). Web Chat exposes this via
  // createStoreWithDevTools so the full action stream is inspectable in the browser.
  devTools?: boolean;
}

interface WebChatAction {
  type: string;
  meta?: unknown;
  payload?: {
    activity?: {
      type?: string;
      name?: string;
      [key: string]: unknown;
    };
  };
}

// Build the Web Chat Redux store with the streaming glue middleware. The streaming
// controller itself lives in src/streaming.ts.
export function createChatStore({
  streaming,
  user,
  jsonWebToken,
  requestLocation,
  devTools,
}: CreateChatStoreOptions) {
  const middleware =
    (store: WebChatStore) =>
    (next: (action: WebChatAction) => unknown) =>
    (action: WebChatAction): unknown => {
      // A new outgoing user turn (typed message or invoke) resets all stream state so
      // progress/answer/typing from the previous turn can't leak into this one.
      if (action.type === 'DIRECT_LINE/POST_ACTIVITY') {
        const outgoing = action.payload && action.payload.activity;
        if (outgoing && (outgoing.type === 'message' || outgoing.type === 'invoke')) {
          streaming.resetForNewTurn(store);
        }
      }

      if (action.type === 'DIRECT_LINE/CONNECT_FULFILLED') {
        store.dispatch({
          type: 'DIRECT_LINE/POST_ACTIVITY',
          meta: { method: 'keyboard' },
          payload: {
            activity: {
              type: 'invoke',
              name: 'InitConversation',
              locale: user.locale,
              value: {
                // must use for authenticated conversation.
                jsonWebToken,

                // Use the following activity to proactively invoke a bot scenario
                /*
                triggeredScenario: {
                    trigger: "{scenario_id}",
                    args: {
                        location: location,
                        myVar1: "{custom_arg_1}",
                        myVar2: "{custom_arg_2}"
                    }
                }
                */
              },
            },
          },
        });
      } else if (action.type === 'DIRECT_LINE/INCOMING_ACTIVITY') {
        // Streaming interprets the incoming activity and tells us how to handle it.
        const directive = streaming.handleIncoming(store, action.payload && action.payload.activity);
        if (directive === 'passthrough') {
          return next(action);
        }
        if (directive === 'swallow') {
          return undefined;
        }

        const incoming = action.payload && action.payload.activity;
        if (incoming && incoming.type === 'event' && incoming.name === 'ShareLocationEvent') {
          requestLocation((location) => {
            store.dispatch({
              type: 'WEB_CHAT/SEND_POST_BACK',
              payload: { value: JSON.stringify(location) },
            });
          });
        }

        const result = next(action);
        if (directive === 'forward-final') {
          // Stop synthetic typing after the authoritative final activity is
          // forwarded so it takes over the bubble cleanly.
          streaming.stopTypingAfterFinal();
        }
        return result;
      }

      return next(action);
    };

  const createStoreFn = devTools ? createStoreWithDevTools : createStore;
  return createStoreFn({}, middleware as never);
}
