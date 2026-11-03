import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  screen,
  cleanup,
  fireEvent,
  act,
} from "@testing-library/react";
import { CitationPill } from "./CitationPill";

afterEach(cleanup);

const LINKS = [
  {
    number: 2,
    url: "https://stacks.cdc.gov/view/1",
    title: "Prevention of Influenza",
  },
  { number: 4, url: "https://stacks.cdc.gov/view/2", title: "Flu Symptoms" },
  { number: 5, url: "https://stacks.cdc.gov/view/3" },
];

const pill = () =>
  screen.getByRole("link", { name: /stacks\.cdc\.gov, \d sources?/ });
const card = () => document.querySelector(".has-cite-card");

const hover = (el: Element) =>
  fireEvent.pointerOver(el, { pointerType: "mouse" });
const unhover = (el: Element) =>
  fireEvent.pointerOut(el, { pointerType: "mouse" });

describe("<CitationPill>", () => {
  it("shows the host and how many more sources it holds", () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    expect(pill().textContent).toBe("stacks.cdc.gov+2");
    expect(pill().getAttribute("aria-label")).toBe("stacks.cdc.gov, 3 sources");
  });

  it("drops www. and the +N count for a single source", () => {
    render(
      <CitationPill
        host="www.cdc.gov"
        links={[{ number: 1, url: "https://www.cdc.gov/a" }]}
      />
    );
    const single = screen.getByRole("link", { name: "cdc.gov, 1 source" });
    expect(single.textContent).toBe("cdc.gov");
  });

  it("opens the card on hover and closes it after the grace period", async () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    hover(pill());
    expect(card()).toBeTruthy();
    expect(pill().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("1/3")).toBeTruthy();

    unhover(pill());
    expect(card()).toBeTruthy();
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(card()).toBeNull();
  });

  it("stays open while the pointer moves into the card", async () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    hover(pill());
    unhover(pill());
    hover(card()!);
    await act(() => new Promise((resolve) => setTimeout(resolve, 200)));
    expect(card()).toBeTruthy();
  });

  it("pages with the card arrows and points the pill at the current link", () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    hover(pill());
    fireEvent.click(screen.getByLabelText("Next source"));
    expect(screen.getByText("2/3")).toBeTruthy();
    expect(screen.getByText("Flu Symptoms")).toBeTruthy();
    expect(pill().getAttribute("href")).toBe("https://stacks.cdc.gov/view/2");
  });

  it("supports the keyboard: focus opens, arrows page, Escape closes", () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    fireEvent.focus(pill());
    expect(card()).toBeTruthy();
    fireEvent.keyDown(pill(), { key: "ArrowRight" });
    fireEvent.keyDown(pill(), { key: "ArrowRight" });
    fireEvent.keyDown(pill(), { key: "ArrowRight" });
    expect(screen.getByText("3/3")).toBeTruthy();
    fireEvent.keyDown(pill(), { key: "ArrowLeft" });
    expect(screen.getByText("2/3")).toBeTruthy();
    fireEvent.keyDown(pill(), { key: "Escape" });
    expect(card()).toBeNull();
  });

  it("on touch, the first tap opens the card instead of navigating", () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    fireEvent.pointerDown(pill(), { pointerType: "touch" });
    const firstTap = fireEvent.click(pill());
    expect(firstTap).toBe(false);
    expect(card()).toBeTruthy();

    fireEvent.pointerDown(pill(), { pointerType: "touch" });
    const secondTap = fireEvent.click(pill());
    expect(secondTap).toBe(true);
  });

  it("closes when the user presses outside the pill and the card", () => {
    render(<CitationPill host="stacks.cdc.gov" links={LINKS} />);
    hover(pill());
    fireEvent.pointerDown(card()!);
    expect(card()).toBeTruthy();
    fireEvent.pointerDown(document.body);
    expect(card()).toBeNull();
  });
});
