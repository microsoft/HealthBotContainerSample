import { describe, it, expect } from "vitest";
import { displayHost, faviconUrl, hostOf } from "./favicon";

describe("favicon", () => {
  it("builds the Bing favicon URL from the source host only", () => {
    expect(faviconUrl("https://www.cdc.gov/flu/index.html?q=1#x")).toBe(
      "https://services.bingapis.com/favicon?url=www.cdc.gov"
    );
  });

  it("returns undefined for a URL without a host", () => {
    expect(faviconUrl("not a url")).toBeUndefined();
    expect(hostOf("not a url")).toBe("");
  });
});

describe("displayHost", () => {
  it("drops only a leading www.", () => {
    expect(displayHost("www.cdc.gov")).toBe("cdc.gov");
    expect(displayHost("stacks.cdc.gov")).toBe("stacks.cdc.gov");
  });
});
