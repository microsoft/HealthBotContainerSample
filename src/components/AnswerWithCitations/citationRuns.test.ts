import { describe, it, expect } from "vitest";
import {
  findCitationGroups,
  findCitationLinks,
  PILL_HOST_ATTR,
  splitIntoRuns,
} from "./citationRuns";

const CDC = "https://www.cdc.gov/flu/a";
const CDC_2 = "https://www.cdc.gov/flu/b";
const STACKS = "https://stacks.cdc.gov/view/1";
const MEDLINE = "https://medlineplus.gov/a.html";

const a = (n: number, url: string) => `<a href="${url}">[${n}]</a>`;

// Parsed nodes are moved into a main-document element so ranges behave like a real answer.
function dom(html: string): HTMLElement {
  const root = document.createElement("div");
  root.append(
    ...new DOMParser().parseFromString(html, "text/html").body.childNodes
  );
  return root;
}

function summary(root: Element) {
  return findCitationGroups(root).map((g) => ({
    host: g.host,
    numbers: g.links.map((l) => l.number),
  }));
}

describe("findCitationLinks", () => {
  it("keeps only http(s) links whose text is a citation number", () => {
    const root = dom(
      `${a(
        1,
        CDC
      )}<a href="${CDC}">CDC home</a><a href="mailto:x@y.z">[2]</a><a href="${MEDLINE}">3</a>`
    );
    expect(findCitationLinks(root).map((l) => l.number)).toEqual([1, 3]);
  });
});

describe("findCitationGroups", () => {
  it("merges an adjacent run by exact host, in first-seen order", () => {
    const root = dom(
      `<p>Flu vaccine.${a(1, CDC)}${a(2, STACKS)}${a(3, CDC_2)}${a(
        4,
        STACKS
      )}${a(5, STACKS)}</p>`
    );
    expect(summary(root)).toEqual([
      { host: "www.cdc.gov", numbers: [1, 3] },
      { host: "stacks.cdc.gov", numbers: [2, 4, 5] },
    ]);
  });

  it("treats whitespace and zero-width characters as adjacent", () => {
    const root = dom(`<p>Text.${a(1, CDC)} \u200B${a(2, CDC_2)}</p>`);
    expect(summary(root)).toEqual([{ host: "www.cdc.gov", numbers: [1, 2] }]);
  });

  it("never merges the same host across sentences", () => {
    const root = dom(`<p>One.${a(1, CDC)} Two.${a(2, CDC_2)}</p>`);
    expect(summary(root)).toEqual([
      { host: "www.cdc.gov", numbers: [1] },
      { host: "www.cdc.gov", numbers: [2] },
    ]);
  });

  it("never merges across block boundaries", () => {
    const root = dom(
      `<ul><li>One.${a(1, CDC)}</li><li>${a(2, CDC_2)}</li></ul>`
    );
    expect(summary(root)).toHaveLength(2);
  });

  it("keeps a repeated URL as its own entry", () => {
    const root = dom(`<p>Text.${a(1, CDC)}${a(2, CDC)}</p>`);
    expect(summary(root)).toEqual([{ host: "www.cdc.gov", numbers: [1, 2] }]);
  });

  it("ignores our own inserted pill nodes when checking adjacency", () => {
    const root = dom(
      `<p>Text.<span ${PILL_HOST_ATTR}>cdc.gov +1</span>${a(
        1,
        CDC
      )}<span ${PILL_HOST_ATTR}>stacks</span>${a(2, STACKS)}</p>`
    );
    expect(splitIntoRuns(findCitationLinks(root))).toHaveLength(1);
  });
});
