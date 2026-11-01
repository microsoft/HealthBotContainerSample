import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  cleanup,
  waitFor,
  fireEvent,
  screen,
} from "@testing-library/react";
import { AnswerWithCitations } from "./AnswerWithCitations";

afterEach(cleanup);

const CDC = "https://www.cdc.gov/flu/a";
const CDC_2 = "https://www.cdc.gov/flu/b";
const STACKS = "https://stacks.cdc.gov/view/1";

const pills = (container: Element) => [
  ...container.querySelectorAll<HTMLAnchorElement>(".has-cite-pill"),
];

describe("<AnswerWithCitations>", () => {
  it("replaces an adjacent run with one pill per host and hides the original links", async () => {
    const { container } = render(
      <AnswerWithCitations>
        <p>
          Flu vaccine.<a href={CDC}>[1]</a>
          <a href={STACKS}>[2]</a>
          <a href={CDC_2}>[3]</a>
        </p>
      </AnswerWithCitations>
    );

    await waitFor(() => expect(pills(container)).toHaveLength(2));
    const [cdc, stacks] = pills(container);
    expect(cdc.textContent).toBe("cdc.gov+1");
    expect(cdc.getAttribute("href")).toBe(CDC);
    expect(stacks.textContent).toBe("stacks.cdc.gov");

    const originals = container.querySelectorAll("a:not(.has-cite-pill)");
    originals.forEach((a) =>
      expect(a.classList.contains("has-cite__hidden")).toBe(true)
    );
    expect(originals[0].getAttribute("href")).toBe(CDC);
  });

  it("keeps the same host in different sentences as separate pills", async () => {
    const { container } = render(
      <AnswerWithCitations>
        <p>
          One.<a href={CDC}>[1]</a> Two.<a href={CDC_2}>[2]</a>
        </p>
      </AnswerWithCitations>
    );
    await waitFor(() => expect(pills(container)).toHaveLength(2));
    expect(pills(container).map((p) => p.textContent)).toEqual([
      "cdc.gov",
      "cdc.gov",
    ]);
  });

  it("shows source titles and snippets from the sources list in the card", async () => {
    const sources = new Map([
      [1, { title: "About Influenza | CDC", snippet: "Flu is contagious." }],
    ]);
    const { container } = render(
      <AnswerWithCitations sources={sources}>
        <p>
          Text.<a href={CDC}>[1]</a>
          <a href={CDC_2}>[2]</a>
        </p>
      </AnswerWithCitations>
    );
    await waitFor(() => expect(pills(container)).toHaveLength(1));
    fireEvent.pointerOver(pills(container)[0], { pointerType: "mouse" });
    expect(screen.getByText("About Influenza | CDC")).toBeTruthy();
    expect(screen.getByText("Flu is contagious.")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Next source"));
    expect(
      screen.getByRole("link", { name: "cdc.gov" }).getAttribute("href")
    ).toBe(CDC_2);
  });

  it("leaves non-citation links untouched", async () => {
    const { container } = render(
      <AnswerWithCitations>
        <a href="https://www.cdc.gov">CDC home</a>
      </AnswerWithCitations>
    );
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(pills(container)).toHaveLength(0);
    expect(container.querySelector("a")!.classList.length).toBe(0);
  });

  it("shows a link again once it stops being a citation", async () => {
    const { container } = render(
      <AnswerWithCitations>
        <p>
          Text.<a href={CDC}>[1]</a>
        </p>
      </AnswerWithCitations>
    );
    await waitFor(() => expect(pills(container)).toHaveLength(1));
    const original = container.querySelector<HTMLAnchorElement>(
      `a[href="${CDC}"]:not(.has-cite-pill)`
    )!;
    expect(original.classList.contains("has-cite__hidden")).toBe(true);

    original.textContent = "CDC flu page";
    await waitFor(() => expect(pills(container)).toHaveLength(0));
    expect(original.classList.contains("has-cite__hidden")).toBe(false);
  });

  it("follows the answer when Web Chat re-renders its content", async () => {
    const { container } = render(
      <AnswerWithCitations>
        <p className="answer">
          Text.<a href={CDC}>[1]</a>
        </p>
      </AnswerWithCitations>
    );
    await waitFor(() => expect(pills(container)).toHaveLength(1));

    const link = (href: string, text: string) =>
      Object.assign(document.createElement("a"), { href, textContent: text });
    container
      .querySelector(".answer")!
      .replaceChildren("Text.", link(STACKS, "[1]"), link(CDC, "[2]"));
    await waitFor(() =>
      expect(pills(container).map((p) => p.textContent)).toEqual([
        "stacks.cdc.gov",
        "cdc.gov",
      ])
    );
  });
});
