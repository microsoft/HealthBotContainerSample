import { describe, it, expect, vi } from "vitest";
import { createConnectionMiddleware } from "./connectionMiddleware";
import type { WebChatStore } from "../wire";
import type { LocaleController } from "../locale/locale";
import type { GeoLocation } from "../../types";

interface Action {
  type: string;
  meta?: unknown;
  payload?: { activity?: Record<string, unknown>; value?: unknown };
}

function fakeLocale(initial = "en-US"): LocaleController {
  return {
    get: () => initial,
    setFromBot: () => {},
    tagUserActivity: () => {},
  };
}

function harness(
  jsonWebToken: string,
  requestLocation: (cb: (location?: GeoLocation) => void) => void
) {
  const dispatched: Action[] = [];
  const forwarded: Action[] = [];
  const store = {
    dispatch: vi.fn((action: Action) => dispatched.push(action)),
  } as unknown as WebChatStore;
  const next = (action: Action) => {
    forwarded.push(action);
    return action;
  };
  const dispatch = createConnectionMiddleware({
    jsonWebToken,
    locale: fakeLocale(),
    requestLocation,
  })(store)(next as never);
  return {
    dispatched,
    forwarded,
    dispatch: dispatch as (action: Action) => unknown,
  };
}

const noLocation = (cb: (location?: GeoLocation) => void) => cb();

describe("createConnectionMiddleware — conversation auth", () => {
  it("sends InitConversation with the JWT once Direct Line connects", () => {
    const { dispatched, forwarded, dispatch } = harness("jwt-abc", noLocation);
    dispatch({ type: "DIRECT_LINE/CONNECT_FULFILLED" });

    const init = dispatched.find(
      (a) => a.payload?.activity?.name === "InitConversation"
    );
    expect(init?.payload?.activity).toMatchObject({
      type: "invoke",
      name: "InitConversation",
      locale: "en-US",
      value: { jsonWebToken: "jwt-abc" },
    });
    // The connect action still flows down the chain.
    expect(forwarded).toHaveLength(1);
  });

  it("forwards unrelated actions untouched", () => {
    const { dispatched, forwarded, dispatch } = harness("jwt", noLocation);
    dispatch({ type: "DIRECT_LINE/POST_ACTIVITY", payload: { activity: {} } });
    expect(dispatched).toHaveLength(0);
    expect(forwarded).toHaveLength(1);
  });
});

describe("createConnectionMiddleware — ShareLocation", () => {
  it("answers a ShareLocationEvent with the resolved location as a post-back", () => {
    const location: GeoLocation = { lat: 32.1, long: 34.8 };
    const requestLocation = vi.fn((cb: (l?: GeoLocation) => void) => cb(location));
    const { dispatched, forwarded, dispatch } = harness("jwt", requestLocation);

    dispatch({
      type: "DIRECT_LINE/INCOMING_ACTIVITY",
      payload: { activity: { type: "event", name: "ShareLocationEvent" } },
    });

    expect(requestLocation).toHaveBeenCalledOnce();
    expect(dispatched).toContainEqual({
      type: "WEB_CHAT/SEND_POST_BACK",
      payload: { value: JSON.stringify(location) },
    });
    // The event itself is still forwarded for rendering decisions downstream.
    expect(forwarded).toHaveLength(1);
  });

  it("ignores non-ShareLocation events", () => {
    const requestLocation = vi.fn();
    const { dispatched, dispatch } = harness("jwt", requestLocation);
    dispatch({
      type: "DIRECT_LINE/INCOMING_ACTIVITY",
      payload: { activity: { type: "event", name: "SomethingElse" } },
    });
    expect(requestLocation).not.toHaveBeenCalled();
    expect(dispatched).toHaveLength(0);
  });
});
