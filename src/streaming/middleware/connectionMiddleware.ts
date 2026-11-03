import { INCOMING_ACTIVITY, POST_ACTIVITY } from "../wire";
import type { WebChatAction, WebChatStore } from "../wire";
import type { GeoLocation } from "../../types";
import type { LocaleController } from "../locale/locale";

const CONNECT_FULFILLED = "DIRECT_LINE/CONNECT_FULFILLED";
const SEND_POST_BACK = "WEB_CHAT/SEND_POST_BACK";
const SHARE_LOCATION_EVENT = "ShareLocationEvent";

export interface ConnectionMiddlewareOptions {
  /** Signed token that authenticates this conversation to the bot. */
  jsonWebToken: string;
  locale: LocaleController;
  /** Resolves the browser location for the bot's ShareLocation request. */
  requestLocation: (callback: (location?: GeoLocation) => void) => void;
}

// Customer-connection glue: authenticates the conversation once Direct Line connects and
// answers the bot's location request. Kept isolated from the streaming middleware.
export function createConnectionMiddleware({
  jsonWebToken,
  locale,
  requestLocation,
}: ConnectionMiddlewareOptions) {
  return (store: WebChatStore) =>
    (next: (action: WebChatAction) => unknown) =>
    (action: WebChatAction): unknown => {
      if (action.type === CONNECT_FULFILLED) {
        store.dispatch({
          type: POST_ACTIVITY,
          meta: { method: "keyboard" },
          payload: {
            activity: {
              type: "invoke",
              name: "InitConversation",
              locale: locale.get(),
              value: {
                // Required to authenticate the conversation.
                jsonWebToken,

                // Proactively invoke a bot scenario by uncommenting and filling this in.
                /*
                triggeredScenario: {
                    trigger: "{scenario_id}",
                    args: {
                        myVar1: "{custom_arg_1}",
                        myVar2: "{custom_arg_2}"
                    }
                }
                */
              },
            },
          },
        });
        return next(action);
      }

      if (action.type === INCOMING_ACTIVITY) {
        const activity = action.payload?.activity;
        if (activity?.type === "event" && activity.name === SHARE_LOCATION_EVENT) {
          requestLocation((location) => {
            store.dispatch({
              type: SEND_POST_BACK,
              payload: { value: JSON.stringify(location) },
            });
          });
        }
      }

      return next(action);
    };
}
