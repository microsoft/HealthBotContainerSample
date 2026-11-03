import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const speech = vi.hoisted(() => ({
  ponyfill: undefined as unknown,
  dictateState: 0,
  interims: [] as string[],
  uiState: undefined as string | undefined,
  setSendBox: vi.fn(),
  setShouldSpeak: vi.fn(),
  startDictate: vi.fn(),
  stopDictate: vi.fn(),
}));

vi.mock("botframework-webchat", async () => ({
  Constants: {
    DictateState: (await import("../../streaming/wire")).DictateState,
  },
  hooks: {
    useWebSpeechPonyfill: () => [speech.ponyfill],
    useDictateState: () => [speech.dictateState],
    useDictateInterims: () => [speech.interims],
    useSendBoxValue: () => ["", speech.setSendBox],
    useShouldSpeakIncomingActivity: () => [true, speech.setShouldSpeak],
    useUIState: () => [speech.uiState],
    useStartDictate: () => speech.startDictate,
    useStopDictate: () => speech.stopDictate,
    useLocalizer: () => (id: string) => id,
  },
}));

import { deriveClassNames, sendBoxMiddleware } from "./sendBoxMiddleware";
import { DictateState } from "../../streaming/wire";

const FluentSendBox = ({
  showSend = true,
  sendKey = "send",
}: {
  showSend?: boolean;
  sendKey?: string;
}) => (
  <form>
    <textarea />
    <div className="weDCCeq_sendbox__toolbar">
      <button
        className="weDCCeq_sendbox__toolbar-button"
        data-testid="send box upload button"
        type="button"
      />
      <div role="separator" />
      {showSend && (
        <button
          className="weDCCeq_sendbox__toolbar-button"
          data-testid="send box send button"
          key={sendKey}
          type="submit"
        >
          <div className="wdGN4aG_fluent-icon wdGN4aG_appearance--text wdGN4aG_icon--send" />
        </button>
      )}
    </div>
  </form>
);

type FluentSendBoxProps = Parameters<typeof FluentSendBox>[0];

function renderSendBox(props: FluentSendBoxProps = {}) {
  const SendBox = sendBoxMiddleware[0]()(() => FluentSendBox as never)(
    undefined
  ) as React.ComponentType<FluentSendBoxProps>;
  const view = render(<SendBox {...props} />);
  return {
    rerender: (next: FluentSendBoxProps) =>
      view.rerender(<SendBox {...next} />),
  };
}

const isJustBeforeSend = () =>
  mic()?.parentElement?.nextElementSibling ===
  screen.getByTestId("send box send button");

const mic = () => screen.queryByTestId("send box microphone button");
const classes = (element: Element | null | undefined) =>
  Array.from(element?.classList ?? []);

describe("sendBoxMiddleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    speech.ponyfill = { SpeechRecognition: class {} };
    speech.dictateState = DictateState.IDLE;
    speech.interims = [];
    speech.uiState = undefined;
  });

  it("puts the mic in Fluent's toolbar, just before Send", () => {
    renderSendBox();

    expect(isJustBeforeSend()).toBe(true);
  });

  it("stays just before Send when Fluent re-creates the Send button", async () => {
    const { rerender } = renderSendBox();

    rerender({ sendKey: "recreated" });

    await waitFor(() => expect(isJustBeforeSend()).toBe(true));
  });

  it("follows Send out of and back into the toolbar", async () => {
    const { rerender } = renderSendBox();

    rerender({ showSend: false });
    await waitFor(() => expect(mic()).toBeNull());

    rerender({ showSend: true });
    await waitFor(() => expect(isJustBeforeSend()).toBe(true));
  });

  it("keeps the same send box component across calls so it is not remounted", () => {
    const middleware = sendBoxMiddleware[0]()(() => FluentSendBox as never);

    expect(middleware(undefined)).toBe(middleware(undefined));
  });

  it("passes through when there is no send box", () => {
    expect(sendBoxMiddleware[0]()(() => false)(undefined)).toBe(false);
  });

  it("borrows Fluent's toolbar button and microphone icon styles", () => {
    renderSendBox();

    expect(classes(mic())).toEqual(["weDCCeq_sendbox__toolbar-button"]);
    expect(classes(mic()?.firstElementChild)).toEqual([
      "wdGN4aG_fluent-icon",
      "wdGN4aG_appearance--text",
      "wdGN4aG_icon--microphone",
    ]);
  });

  it("derives Fluent's active and pulse classes from the send button", () => {
    const send = document.createElement("button");
    send.className = "weDCCeq_sendbox__toolbar-button";

    expect(deriveClassNames(send)).toMatchObject({
      active: "weDCCeq_sendbox__toolbar-button--active",
      pulse: "weDCCeq_sendbox__toolbar-button--with-pulse",
    });
  });

  it("hides the mic when speech is not enabled", () => {
    speech.ponyfill = undefined;
    renderSendBox();

    expect(mic()).toBeNull();
  });

  it("starts dictation and mutes bot speech on click", async () => {
    renderSendBox();

    await userEvent.click(mic()!);

    expect(speech.setShouldSpeak).toHaveBeenCalledWith(false);
    expect(speech.startDictate).toHaveBeenCalled();
    expect(mic()?.getAttribute("aria-pressed")).toBe("false");
  });

  it("pulses while dictating", () => {
    speech.dictateState = DictateState.DICTATING;
    renderSendBox();

    expect(mic()?.getAttribute("aria-pressed")).toBe("true");
    expect(classes(mic())).toEqual(
      expect.arrayContaining([
        "weDCCeq_sendbox__toolbar-button--active",
        "weDCCeq_sendbox__toolbar-button--with-pulse",
      ])
    );
    expect(mic()?.getAttribute("aria-label")).toBe(
      "SPEECH_INPUT_MICROPHONE_BUTTON_OPEN_ALT"
    );
  });

  it("stops dictation on click while dictating, leaving the send box to the middleware", async () => {
    speech.dictateState = DictateState.DICTATING;
    speech.interims = [];
    renderSendBox();

    await userEvent.click(mic()!);

    expect(speech.stopDictate).toHaveBeenCalled();
    expect(speech.setSendBox).not.toHaveBeenCalled();
    expect(speech.startDictate).not.toHaveBeenCalled();
  });

  it("never writes the send box while rendering", () => {
    speech.dictateState = DictateState.DICTATING;
    speech.interims = ["what is advil"];
    renderSendBox();

    expect(speech.setSendBox).not.toHaveBeenCalled();
  });

  it.each([
    ["starting", { dictateState: DictateState.STARTING }],
    ["stopping", { dictateState: DictateState.STOPPING }],
    ["chat disabled", { uiState: "disabled" }],
  ])("ignores clicks while %s", async (_, state) => {
    Object.assign(speech, state);
    renderSendBox();

    await userEvent.click(mic()!);

    expect(mic()?.getAttribute("aria-disabled")).toBe("true");
    expect(speech.startDictate).not.toHaveBeenCalled();
    expect(speech.stopDictate).not.toHaveBeenCalled();
  });
});
