import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStreamingMiddleware } from "./streamingMiddleware";
import type { WebChatStore } from "../wire";
import type { StreamController, StreamDirective } from "../controller/models";
import type { LocaleController } from "../locale/locale";

interface Action {
  type: string;
  meta?: unknown;
  payload?: { activity?: Record<string, unknown> };
}

function fakeLocale(initial = "en-US"): LocaleController {
  let current = initial;
  return {
    get: () => current,
    setFromBot: (locale) => {
      if (typeof locale === "string") current = locale;
    },
    tagUserActivity: (activity) => {
      if (activity) activity.locale = current;
    },
  };
}

function fakeStreaming(
  directive: StreamDirective = "passthrough"
): StreamController & {
  resets: number;
} {
  return {
    resets: 0,
    resetForNewTurn() {
      this.resets += 1;
    },
    handleIncoming() {
      return directive;
    },
    hasSeenStream: () => false,
    onFirstStream: () => () => {},
  };
}

function harness(streaming: StreamController, locale: LocaleController) {
  const forwarded: Action[] = [];
  const store = { dispatch: vi.fn() } as unknown as WebChatStore;
  const next = (action: Action) => {
    forwarded.push(action);
    return action;
  };
  const dispatch = createStreamingMiddleware({ streaming, locale })(store)(
    next as never
  );
  return { forwarded, dispatch: dispatch as (action: Action) => unknown };
}

const post = (activity: Record<string, unknown>): Action => ({
  type: "DIRECT_LINE/POST_ACTIVITY",
  payload: { activity },
});
const incoming = (activity: Record<string, unknown>): Action => ({
  type: "DIRECT_LINE/INCOMING_ACTIVITY",
  payload: { activity },
});

describe("createStreamingMiddleware — new-turn reset", () => {
  it("resets stream state on an outgoing message", () => {
    const streaming = fakeStreaming();
    const { dispatch } = harness(streaming, fakeLocale());
    dispatch(post({ type: "message", text: "hi" }));
    expect(streaming.resets).toBe(1);
  });

  it("resets stream state on an outgoing invoke", () => {
    const streaming = fakeStreaming();
    const { dispatch } = harness(streaming, fakeLocale());
    dispatch(post({ type: "invoke", name: "InitConversation" }));
    expect(streaming.resets).toBe(1);
  });
});

describe("createStreamingMiddleware — card-button debounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops a duplicate card-button post inside the debounce window", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    const click = () =>
      dispatch(post({ type: "message", value: { action: "yes", n: 1 } }));
    click();
    click();
    const postBacks = forwarded.filter((a) => a.payload?.activity?.value);
    expect(postBacks).toHaveLength(1);
  });

  it("matches duplicate values regardless of key order", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    dispatch(post({ type: "message", value: { a: 1, b: 2 } }));
    dispatch(post({ type: "message", value: { b: 2, a: 1 } }));
    expect(forwarded.filter((a) => a.payload?.activity?.value)).toHaveLength(1);
  });

  it("allows the same value again after the debounce window elapses", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    dispatch(post({ type: "message", value: { action: "yes" } }));
    vi.advanceTimersByTime(600);
    dispatch(post({ type: "message", value: { action: "yes" } }));
    expect(forwarded.filter((a) => a.payload?.activity?.value)).toHaveLength(2);
  });

  it("does not debounce a distinct value", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    dispatch(post({ type: "message", value: { action: "yes" } }));
    dispatch(post({ type: "message", value: { action: "no" } }));
    expect(forwarded.filter((a) => a.payload?.activity?.value)).toHaveLength(2);
  });

  it("does not confuse a nested object with its JSON string", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    dispatch(post({ type: "message", value: { a: { x: 1 } } }));
    dispatch(post({ type: "message", value: { a: '{"x":1}' } }));
    expect(forwarded.filter((a) => a.payload?.activity?.value)).toHaveLength(2);
  });

  it("still debounces a duplicate that differs only in key order", () => {
    const { forwarded, dispatch } = harness(fakeStreaming(), fakeLocale());
    dispatch(post({ type: "message", value: { a: 1, b: { c: 2, d: 3 } } }));
    dispatch(post({ type: "message", value: { b: { d: 3, c: 2 }, a: 1 } }));
    expect(forwarded.filter((a) => a.payload?.activity?.value)).toHaveLength(1);
  });
});

describe("createStreamingMiddleware — locale sync", () => {
  it("tags an outgoing user message with the current locale", () => {
    const locale = fakeLocale("es-ES");
    const { forwarded, dispatch } = harness(fakeStreaming(), locale);
    dispatch(post({ type: "message", from: { role: "user" }, text: "hola" }));
    expect(forwarded[0].payload?.activity?.locale).toBe("es-ES");
  });

  it("adopts the bot-declared locale from an incoming message", () => {
    const locale = fakeLocale("en-US");
    const { dispatch } = harness(fakeStreaming("passthrough"), locale);
    dispatch(
      incoming({
        type: "message",
        from: { role: "bot" },
        locale: "fr-FR",
        text: "bonjour",
      })
    );
    expect(locale.get()).toBe("fr-FR");
  });
});

describe("createStreamingMiddleware — directive handling", () => {
  it("passthrough forwards the action", () => {
    const { forwarded, dispatch } = harness(
      fakeStreaming("passthrough"),
      fakeLocale()
    );
    dispatch(incoming({ type: "message", from: { role: "bot" }, text: "x" }));
    expect(forwarded).toHaveLength(1);
  });

  it("swallow drops the action", () => {
    const { forwarded, dispatch } = harness(
      fakeStreaming("swallow"),
      fakeLocale()
    );
    dispatch(
      incoming({
        type: "message",
        from: { role: "bot" },
        value: { stream: {} },
      })
    );
    expect(forwarded).toHaveLength(0);
  });

  it("forward-final forwards the reconciled final activity", () => {
    const streaming = fakeStreaming("forward-final");
    const { forwarded, dispatch } = harness(streaming, fakeLocale());
    dispatch(
      incoming({ type: "message", from: { role: "bot" }, text: "final" })
    );
    expect(forwarded).toHaveLength(1);
  });
});
