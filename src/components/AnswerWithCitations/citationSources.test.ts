import { describe, it, expect } from "vitest";
import { citationSources } from "./citationSources";

const ADAPTIVE_CARD = "application/vnd.microsoft.card.adaptive";

// Mirrors the sources-list row the bot builds for each evidence item.
const sourceRow = (n: number, title: string, isVisible = true) => ({
  type: "ColumnSet",
  id: `row${n}`,
  ...(isVisible ? {} : { isVisible: false }),
  columns: [
    {
      type: "Column",
      width: "auto",
      items: [{ type: "TextBlock", text: `${n}` }],
    },
    {
      type: "Column",
      width: "stretch",
      items: [
        { type: "Container", items: [{ type: "TextBlock", text: title }] },
      ],
    },
    {
      type: "Column",
      items: [{ type: "Image", url: "https://x/ChevronDown.png" }],
    },
  ],
});

const sourceBody = (id: string, items: unknown[]) => ({
  type: "Container",
  id: `${id}_content`,
  isVisible: false,
  items: [{ type: "Container", items }],
});

const link = {
  type: "TextBlock",
  color: "accent",
  text: "[Title - full article](https://a)",
};
const footer = {
  type: "TextBlock",
  isSubtle: true,
  size: "Small",
  text: "© UpToDate",
};

const card = (body: unknown[]) => [
  { contentType: ADAPTIVE_CARD, content: { type: "AdaptiveCard", body } },
];

describe("citationSources", () => {
  it("maps each sources-list number to its title, including rows hidden behind 'Show More'", () => {
    const sources = citationSources(
      card([
        {
          type: "Container",
          items: [{ type: "TextBlock", text: "Answer [[1]](https://a)" }],
        },
        sourceRow(1, "About Influenza | CDC"),
        { type: "Container", items: [sourceRow(2, "Flu Symptoms")] },
        sourceRow(4, "Hidden source", false),
      ])
    );
    expect([...sources]).toEqual([
      [1, { title: "About Influenza | CDC" }],
      [2, { title: "Flu Symptoms" }],
      [4, { title: "Hidden source" }],
    ]);
  });

  it("reads each row's snippet as plain text, skipping the link and footer", () => {
    const sources = citationSources(
      card([
        sourceRow(1, "About Influenza | CDC"),
        sourceBody("row1", [
          {
            type: "TextBlock",
            text: "**Flu** is a _contagious_ [illness](https://x).",
          },
          link,
          footer,
        ]),
      ])
    );
    expect(sources.get(1)).toEqual({
      title: "About Influenza | CDC",
      snippet: "Flu is a contagious illness.",
    });
  });

  it("skips only the accent-colored source link, keeping other colored text", () => {
    const sources = citationSources(
      card([
        sourceRow(2, "Flu"),
        sourceBody("row2", [
          { type: "TextBlock", color: "good", text: "Vaccines work." },
          {
            type: "TextBlock",
            color: "Accent",
            text: "[Flu - full article](https://a)",
          },
        ]),
      ])
    );
    expect(sources.get(2)?.snippet).toBe("Vaccines work.");
  });

  it("joins multi-line rich-text snippets into one line", () => {
    const sources = citationSources(
      card([
        sourceRow(3, "Patient context"),
        sourceBody("row3", [
          {
            type: "RichTextBlock",
            inlines: [{ type: "TextRun", text: "Line one" }],
          },
          { type: "TextBlock", text: " " },
          {
            type: "RichTextBlock",
            inlines: [{ type: "TextRun", text: "Line  two" }],
          },
        ]),
      ])
    );
    expect(sources.get(3)?.snippet).toBe("Line one Line two");
  });

  it("returns an empty map when the card has no sources list", () => {
    expect(
      citationSources(card([{ type: "TextBlock", text: "Answer" }])).size
    ).toBe(0);
  });

  it("ignores non adaptive-card attachments and missing attachments", () => {
    expect(citationSources(undefined).size).toBe(0);
    expect(
      citationSources([
        { contentType: "image/png", content: sourceRow(1, "x") },
      ]).size
    ).toBe(0);
  });

  it("ignores column sets that are not sources-list rows", () => {
    const sources = citationSources(
      card([
        {
          type: "ColumnSet",
          columns: [
            { type: "Column", items: [{ type: "TextBlock", text: "Name" }] },
            {
              type: "Column",
              items: [
                {
                  type: "Container",
                  items: [{ type: "TextBlock", text: "x" }],
                },
              ],
            },
          ],
        },
      ])
    );
    expect(sources.size).toBe(0);
  });
});
