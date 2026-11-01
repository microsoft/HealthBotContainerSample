import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDictationMiddleware,
  reportRecognitionErrors,
} from "./dictationMiddleware";
import {
  DICTATION_ERROR,
  DictateState,
  SET_DICTATE_INTERIMS,
  SET_DICTATE_STATE,
  SET_SEND_BOX,
  START_DICTATE,
  START_SPEAKING,
  STOP_DICTATE,
  SUBMIT_SEND_BOX,
} from "../wire";

const { IDLE, STARTING, DICTATING, STOPPING } = DictateState;

type Action = { type: string; payload?: Record<string, unknown> };

function createStore() {
  const state = { dictateState: IDLE };
  const actions: Action[] = [];
  const store = {
    getState: () => state,
    dispatch: (action: unknown): unknown => dispatch(action as Action),
  };
  const reduce = (action: Action) => {
    actions.push(action);
    if (action.type === SET_DICTATE_STATE) {
      state.dictateState = action.payload
        ?.dictateState as typeof state.dictateState;
    }
    return action;
  };
  const dispatch = createDictationMiddleware()(store)(reduce as never) as (
    action: Action
  ) => unknown;
  return { dispatch, actions, state };
}

const interims = (...dictateInterims: string[]) => ({
  type: SET_DICTATE_INTERIMS,
  payload: { dictateInterims },
});
const dictateState = (value: number) => ({
  type: SET_DICTATE_STATE,
  payload: { dictateState: value },
});
const submits = (actions: Action[]) =>
  actions.filter((action) => action.type === SUBMIT_SEND_BOX);

describe("createDictationMiddleware", () => {
  let store: ReturnType<typeof createStore>;

  beforeEach(() => {
    store = createStore();
    store.dispatch({ type: START_DICTATE });
    store.dispatch(dictateState(DICTATING));
  });

  it("sends the transcript when recognition ends on a pause without a final result", () => {
    store.dispatch(interims("what is"));
    store.dispatch(interims("what is advil"));
    store.dispatch(interims());
    store.dispatch(dictateState(IDLE));

    const after = store.actions.slice(-4).map(({ type }) => type);
    expect(after).toEqual([
      SET_DICTATE_STATE,
      SET_SEND_BOX,
      SUBMIT_SEND_BOX,
      START_SPEAKING,
    ]);
    expect(store.actions.at(-3)?.payload).toEqual({ text: "what is advil" });
    expect(store.actions.at(-2)?.payload).toMatchObject({ method: "speech" });
  });

  it("shows the live transcript in the send box while dictating", () => {
    store.dispatch(interims("what is", "advil"));

    expect(store.actions.at(-1)).toEqual({
      type: SET_SEND_BOX,
      payload: { text: "what is advil" },
    });
  });

  it("does not clear the send box when Web Chat clears the interims", () => {
    store.dispatch(interims("what is advil"));
    const before = store.actions.length;
    store.dispatch(interims());

    expect(store.actions.slice(before).map(({ type }) => type)).toEqual([
      SET_DICTATE_INTERIMS,
    ]);
  });

  it("leaves Web Chat's final transcript untouched until it is submitted", () => {
    store.dispatch(interims("what is advil"));
    const before = store.actions.length;
    store.dispatch(interims());
    store.dispatch({ type: SET_SEND_BOX, payload: { text: "what is Advil" } });
    store.dispatch({ type: SUBMIT_SEND_BOX, payload: { method: "speech" } });

    const sendBoxWrites = store.actions
      .slice(before)
      .filter(({ type }) => type === SET_SEND_BOX);
    expect(sendBoxWrites).toEqual([
      { type: SET_SEND_BOX, payload: { text: "what is Advil" } },
    ]);
  });

  it("does not write the send box after the user stopped dictating", () => {
    store.dispatch(dictateState(STOPPING));
    const before = store.actions.length;
    store.dispatch(interims("late interim"));

    expect(store.actions.slice(before).map(({ type }) => type)).toEqual([
      SET_DICTATE_INTERIMS,
    ]);
  });

  it("does not send twice when Web Chat already sent the final result", () => {
    store.dispatch(interims("what is advil"));
    store.dispatch(interims());
    store.dispatch({
      type: SUBMIT_SEND_BOX,
      payload: { method: "speech" },
    });
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(1);
  });

  it("keeps the transcript in the send box when the user stops dictation", () => {
    store.dispatch(interims("what is advil"));
    store.dispatch({ type: STOP_DICTATE });
    store.dispatch(dictateState(STOPPING));
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(0);
  });

  it("sends nothing when the user said nothing", () => {
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(0);
  });

  it("does not resend an earlier transcript in the next dictation", () => {
    store.dispatch(interims("what is advil"));
    store.dispatch(dictateState(IDLE));
    store.dispatch({ type: START_DICTATE });
    store.dispatch(dictateState(STARTING));
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(1);
  });

  it("keeps the transcript in the send box, unsent, when recognition fails", () => {
    store.dispatch(interims("what is advil"));
    store.dispatch({ type: DICTATION_ERROR });
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(0);
    expect(store.actions.some(({ type }) => type === DICTATION_ERROR)).toBe(
      false
    );
  });

  it("auto-sends again in the next dictation after a failure", () => {
    store.dispatch({ type: DICTATION_ERROR });
    store.dispatch(dictateState(IDLE));
    store.dispatch({ type: START_DICTATE });
    store.dispatch(dictateState(DICTATING));
    store.dispatch(interims("what is advil"));
    store.dispatch(dictateState(IDLE));

    expect(submits(store.actions)).toHaveLength(1);
  });
});

describe("reportRecognitionErrors", () => {
  class FakeRecognition extends EventTarget {}
  const fail = (recognition: EventTarget, error: string) =>
    recognition.dispatchEvent(Object.assign(new Event("error"), { error }));

  function create() {
    const dispatch = vi.fn();
    const factory = reportRecognitionErrors(
      () => ({ SpeechRecognition: FakeRecognition, speechSynthesis: "kept" }),
      dispatch
    );
    const ponyfill = factory(undefined) as {
      SpeechRecognition: new () => EventTarget;
      speechSynthesis: string;
    };
    return { dispatch, ponyfill };
  }

  it("reports a recognition error to the store", () => {
    const { dispatch, ponyfill } = create();

    fail(new ponyfill.SpeechRecognition(), "network");

    expect(dispatch).toHaveBeenCalledWith({ type: DICTATION_ERROR });
  });

  it("ignores aborts", () => {
    const { dispatch, ponyfill } = create();

    fail(new ponyfill.SpeechRecognition(), "aborted");

    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps the rest of the ponyfill", () => {
    const { ponyfill } = create();

    expect(ponyfill.speechSynthesis).toBe("kept");
    expect(new ponyfill.SpeechRecognition()).toBeInstanceOf(FakeRecognition);
  });

  it("passes through a ponyfill without speech recognition", () => {
    const ponyfill = { speechSynthesis: "only" };

    expect(reportRecognitionErrors(() => ponyfill, vi.fn())(undefined)).toBe(
      ponyfill
    );
  });
});
