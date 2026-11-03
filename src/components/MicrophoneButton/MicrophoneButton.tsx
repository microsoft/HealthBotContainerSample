import { useCallback } from "react";
import type { ReactElement } from "react";
import { Constants, hooks } from "botframework-webchat";

const {
  useDictateState,
  useLocalizer,
  useShouldSpeakIncomingActivity,
  useStartDictate,
  useStopDictate,
  useUIState,
  useWebSpeechPonyfill,
} = hooks;

const { DictateState } = Constants;

export interface MicrophoneButtonClassNames {
  button: string;
  active: string;
  pulse: string;
  icon: string;
}

interface MicrophoneButtonProps {
  classNames: MicrophoneButtonClassNames;
}

export function MicrophoneButton({
  classNames,
}: MicrophoneButtonProps): ReactElement | null {
  const [webSpeechPonyfill] = useWebSpeechPonyfill();
  const [dictateState] = useDictateState();
  const [, setShouldSpeakIncomingActivity] = useShouldSpeakIncomingActivity();
  const [uiState] = useUIState();
  const startDictate = useStartDictate();
  const stopDictate = useStopDictate();
  const localize = useLocalizer();

  const dictating = dictateState === DictateState.DICTATING;

  const onClick = useCallback(() => {
    if (dictateState === DictateState.WILL_START) {
      setShouldSpeakIncomingActivity(false);
    } else if (dictateState === DictateState.DICTATING) {
      stopDictate();
    } else {
      setShouldSpeakIncomingActivity(false);
      startDictate();
    }
  }, [dictateState, setShouldSpeakIncomingActivity, startDictate, stopDictate]);

  if (!webSpeechPonyfill?.SpeechRecognition) {
    return null;
  }

  const disabled =
    uiState === "disabled" ||
    dictateState === DictateState.STARTING ||
    dictateState === DictateState.STOPPING;
  const active = dictateState !== DictateState.IDLE;

  return (
    <button
      aria-disabled={disabled ? "true" : undefined}
      aria-label={localize(
        dictating
          ? "SPEECH_INPUT_MICROPHONE_BUTTON_OPEN_ALT"
          : "SPEECH_INPUT_MICROPHONE_BUTTON_CLOSE_ALT"
      )}
      aria-pressed={active}
      className={[
        classNames.button,
        active && classNames.active,
        dictating && classNames.pulse,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="send box microphone button"
      onClick={disabled ? undefined : onClick}
      tabIndex={disabled ? -1 : undefined}
      type="button"
    >
      <div className={classNames.icon} />
    </button>
  );
}
