import { describe, it, expect } from "vitest";
import { cardSnippet, removeTitle } from "./snippet";

describe("removeTitle", () => {
  it("drops the title the page repeats at the start (MedlinePlus)", () => {
    expect(
      removeTitle(
        "Insomnia | MedlinePlus Home → Health Topics → Insomnia On this page",
        "Insomnia | MedlinePlus"
      )
    ).toBe("Home → Health Topics → Insomnia On this page");
  });

  it("matches a title with the server's duplicate suffix, and trims leftover separators (MSD)", () => {
    expect(
      removeTitle(
        "Insomnia and Excessive Daytime Sleepiness (EDS) - Neurology - MSD Manual Professional Edition <Sleep and Wakefulness Disorders",
        "Insomnia and Excessive Daytime Sleepiness (EDS) - Neurology - MSD Manual Professional Edition (1)"
      )
    ).toBe("Sleep and Wakefulness Disorders");
  });

  it("ignores case and spacing differences", () => {
    expect(
      removeTitle("WHAT IS  insomnia?   Health A-Z", "What is insomnia?")
    ).toBe("Health A-Z");
  });

  it("removes the title when it appears later in the snippet", () => {
    expect(
      removeTitle(
        "Health A-Z: What is insomnia? Sleep tips",
        "What is insomnia?"
      )
    ).toBe("Health A-Z: Sleep tips");
  });

  it("never matches the title inside a longer word", () => {
    expect(removeTitle("Influenza symptoms include fever.", "Flu")).toBe(
      "Influenza symptoms include fever."
    );
  });

  it("matches the title before punctuation", () => {
    expect(removeTitle("Flu, a contagious illness.", "Flu")).toBe(
      "a contagious illness."
    );
  });

  it("keeps the snippet when it does not contain the title, or there is no title", () => {
    expect(removeTitle("Flu is a contagious illness.", "About Influenza")).toBe(
      "Flu is a contagious illness."
    );
    expect(removeTitle("Flu is a contagious illness.")).toBe(
      "Flu is a contagious illness."
    );
  });
});

describe("cardSnippet", () => {
  it("hides the snippet when it was only the title", () => {
    expect(
      cardSnippet("Insomnia | MedlinePlus", "Insomnia | MedlinePlus")
    ).toBeUndefined();
    expect(cardSnippet(undefined, "Insomnia | MedlinePlus")).toBeUndefined();
  });

  it("removes the title but keeps the full remaining text", () => {
    const rest = "Sleep tips ".repeat(15).trim();
    expect(cardSnippet(`What is insomnia? ${rest}`, "What is insomnia?")).toBe(
      rest
    );
  });
});
