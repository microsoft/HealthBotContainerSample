import { describe, it, expect } from "vitest";
import { markdownToPlainText } from "./markdownToPlainText";

describe("markdownToPlainText", () => {
  it("drops markdown syntax and keeps the readable text", () => {
    expect(
      markdownToPlainText(
        "**Ibuprofen** is an _NSAID_. See [MedlinePlus](https://medlineplus.gov/x)."
      )
    ).toBe("Ibuprofen is an NSAID. See MedlinePlus.");
  });

  it("flattens lists and headings into one line", () => {
    expect(
      markdownToPlainText(
        "# Dosage\n\n- Adults: 200 mg\n- Children: ask a doctor"
      )
    ).toBe("Dosage Adults: 200 mg Children: ask a doctor");
  });

  it("keeps raw HTML as literal text instead of rendering it", () => {
    expect(markdownToPlainText("Use <b>caution</b>")).toBe(
      "Use <b>caution</b>"
    );
  });

  it("returns an empty string for blank input", () => {
    expect(markdownToPlainText("   ")).toBe("");
  });
});
