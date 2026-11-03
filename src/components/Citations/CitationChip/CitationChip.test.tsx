import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { CitationChip } from "./CitationChip";

afterEach(cleanup);

describe("<CitationChip>", () => {
  it("renders the Bing favicon for the source host", () => {
    const { container } = render(
      <CitationChip url="https://www.cdc.gov/flu/index.html" />
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://services.bingapis.com/favicon?url=www.cdc.gov"
    );
  });

  it("never sends a referrer with the favicon request", () => {
    const { container } = render(<CitationChip url="https://www.cdc.gov/x" />);
    expect(container.querySelector("img")?.getAttribute("referrerpolicy")).toBe(
      "no-referrer"
    );
  });

  it("is decorative so the surrounding control owns the accessible name", () => {
    const { container } = render(<CitationChip url="https://www.cdc.gov/x" />);
    const chip = container.querySelector(".has-cite__chip")!;
    expect(chip.getAttribute("aria-hidden")).toBe("true");
    expect(chip.getAttribute("title")).toBeNull();
  });

  it("shows a globe when the favicon service is unreachable", () => {
    const { container } = render(
      <CitationChip url="https://unknown.example/page" />
    );
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".has-cite__globe")).toBeTruthy();
  });
});
