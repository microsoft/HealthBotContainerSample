import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { CitationCard, type CitationCardLink } from "./CitationCard";
import { cardSnippet } from "./snippet";

afterEach(cleanup);

const LONG_SNIPPET =
  "Annual flu vaccination is recommended for everyone 6 months and older, with rare exceptions, to reduce illness.";

const LINKS: CitationCardLink[] = [
  {
    number: 2,
    url: "https://stacks.cdc.gov/view/1",
    title: "Prevention of Influenza",
    snippet: LONG_SNIPPET,
  },
  { number: 4, url: "https://stacks.cdc.gov/view/2" },
];

function renderCard(index: number, links = LINKS) {
  const onIndexChange = vi.fn();
  render(
    <CitationCard
      id="card"
      host="stacks.cdc.gov"
      links={links}
      index={index}
      onIndexChange={onIndexChange}
    />
  );
  return onIndexChange;
}

describe("<CitationCard>", () => {
  it("has a single link, the site header, which stretches over the card", () => {
    renderCard(0);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].classList.contains("has-cite-card__source")).toBe(true);
    expect(links[0].textContent).toBe("stacks.cdc.gov");
    expect(links[0].getAttribute("href")).toBe("https://stacks.cdc.gov/view/1");
    expect(links[0].getAttribute("target")).toBe("_blank");
  });

  it("shows the title and the full snippet as plain text, without the URL", () => {
    renderCard(0);
    expect(screen.getByText("Prevention of Influenza").closest("a")).toBeNull();
    expect(
      screen
        .getByText(cardSnippet(LONG_SNIPPET, "Prevention of Influenza")!)
        .closest("a")
    ).toBeNull();
    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.queryByText("https://stacks.cdc.gov/view/1")).toBeNull();
  });

  it("shows the snippet without the repeated title", () => {
    renderCard(0, [
      {
        number: 1,
        url: "https://medlineplus.gov/insomnia.html",
        title: "Insomnia | MedlinePlus",
        snippet:
          "Insomnia | MedlinePlus Insomnia is trouble falling or staying asleep.",
      },
    ]);
    expect(
      screen.getByText("Insomnia is trouble falling or staying asleep.")
    ).toBeTruthy();
  });

  it("omits the title and snippet when the source has none", () => {
    renderCard(1);
    expect(document.querySelector(".has-cite-card__title")).toBeNull();
    expect(document.querySelector(".has-cite-card__snippet")).toBeNull();
    expect(screen.getByRole("link").getAttribute("href")).toBe(
      "https://stacks.cdc.gov/view/2"
    );
  });

  it("pages with the arrows and disables them at the ends", () => {
    const first = renderCard(0);
    expect(
      (screen.getByLabelText("Previous source") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByLabelText("Next source"));
    expect(first).toHaveBeenCalledWith(1);
    cleanup();

    const last = renderCard(1);
    expect(
      (screen.getByLabelText("Next source") as HTMLButtonElement).disabled
    ).toBe(true);
    fireEvent.click(screen.getByLabelText("Previous source"));
    expect(last).toHaveBeenCalledWith(0);
  });

  it("hides the arrows for a single source", () => {
    renderCard(0, [LINKS[0]]);
    expect(screen.queryByLabelText("Next source")).toBeNull();
    expect(screen.queryByText("1/1")).toBeNull();
  });
});
