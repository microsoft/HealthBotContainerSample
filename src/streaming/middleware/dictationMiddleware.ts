import {
  DICTATION_ERROR,
  DictateState,
  SET_DICTATE_INTERIMS,
  SET_DICTATE_STATE,
  SET_SEND_BOX,
  START_DICTATE,
  START_SPEAKING,
  SUBMIT_SEND_BOX,
  type WebChatAction,
  type WebChatStore,
} from "../wire";

type DictationStore = Pick<WebChatStore, "dispatch"> & {
  getState: () => { dictateState?: number };
};

const setSendBox = (store: DictationStore, text: string) =>
  store.dispatch({ type: SET_SEND_BOX, payload: { text } });

export function createDictationMiddleware() {
  let transcript = "";
  let failed = false;

  return (store: DictationStore) =>
    (next: (action: WebChatAction) => unknown) =>
    (action: WebChatAction): unknown => {
      switch (action.type) {
        case START_DICTATE:
          transcript = "";
          failed = false;
          break;

        case SUBMIT_SEND_BOX:
          transcript = "";
          break;

        case DICTATION_ERROR:
          failed = true;
          return undefined;

        case SET_DICTATE_INTERIMS: {
          const interims = (action.payload?.dictateInterims ?? [])
            .join(" ")
            .trim();
          if (!interims) {
            break;
          }
          transcript = interims;

          const result = next(action);
          const { dictateState } = store.getState();
          if (
            dictateState === DictateState.STARTING ||
            dictateState === DictateState.DICTATING
          ) {
            setSendBox(store, interims);
          }
          return result;
        }

        case SET_DICTATE_STATE: {
          if (action.payload?.dictateState !== DictateState.IDLE) {
            break;
          }
          const endedOnPause =
            !failed && store.getState().dictateState === DictateState.DICTATING;
          const pending = transcript;
          transcript = "";

          const result = next(action);
          if (endedOnPause && pending) {
            setSendBox(store, pending);
            store.dispatch({
              type: SUBMIT_SEND_BOX,
              payload: {
                method: "speech",
                channelData: {
                  speech: { alternatives: [{ transcript: pending }] },
                },
              },
            });
            store.dispatch({ type: START_SPEAKING });
          }
          return result;
        }
      }

      return next(action);
    };
}

type SpeechRecognitionClass = new () => EventTarget;
type WebSpeechPonyfill = {
  SpeechRecognition?: SpeechRecognitionClass;
  [key: string]: unknown;
};
type WebSpeechPonyfillFactory = (options: unknown) => WebSpeechPonyfill;

export function reportRecognitionErrors(
  factory: WebSpeechPonyfillFactory,
  dispatch: (action: { type: string }) => unknown
): WebSpeechPonyfillFactory {
  return (options) => {
    const ponyfill = factory(options);
    const Recognition = ponyfill?.SpeechRecognition;
    if (!Recognition) {
      return ponyfill;
    }

    return {
      ...ponyfill,
      SpeechRecognition: class extends Recognition {
        constructor() {
          super();
          this.addEventListener("error", (event) => {
            if ((event as Event & { error?: string }).error !== "aborted") {
              dispatch({ type: DICTATION_ERROR });
            }
          });
        }
      },
    };
  };
}
