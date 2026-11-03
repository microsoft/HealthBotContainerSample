export interface CitationLink {
  anchor: HTMLAnchorElement;
  /** The inline citation number, e.g. 1 for "[1]". Matches the sources list numbering. */
  number: number;
  url: string;
  host: string;
}

export interface CitationGroup {
  host: string;
  links: CitationLink[];
}

/** Marks nodes we insert into the answer so they never count as text between citations. */
export const PILL_HOST_ATTR = "data-cite-pill";

// Citation anchors render as a bare number link, e.g. <a href="https://…">[1]</a>.
// The brackets are optional so a renderer that drops them (plain "1") still matches.
const CITATION_TEXT = /^\s*\[?(\d+)\]?\s*$/;
const ONLY_SPACING = /^[\s\u200B\uFEFF]*$/;
const BLOCK_ELEMENTS =
  "p, div, li, ul, ol, br, hr, table, tr, td, th, h1, h2, h3, h4, h5, h6, blockquote, pre";

export function toCitationLink(
  anchor: HTMLAnchorElement
): CitationLink | undefined {
  const href = anchor.getAttribute("href") ?? "";
  if (!/^https?:\/\//i.test(href)) return undefined;
  const match = (anchor.textContent ?? "").match(CITATION_TEXT);
  if (!match) return undefined;
  try {
    const url = new URL(anchor.href);
    return {
      anchor,
      number: Number(match[1]),
      url: url.href,
      host: url.hostname,
    };
  } catch {
    return undefined;
  }
}

export function findCitationLinks(root: Element): CitationLink[] {
  const links: CitationLink[] = [];
  root.querySelectorAll("a[href]").forEach((el) => {
    const link = toCitationLink(el as HTMLAnchorElement);
    if (link) links.push(link);
  });
  return links;
}

// Two citations are adjacent when nothing but spacing separates them inside the same block.
// Crossing a block boundary makes cloneContents() carry partial block clones, which ends the run.
function areAdjacent(
  left: HTMLAnchorElement,
  right: HTMLAnchorElement
): boolean {
  const range = left.ownerDocument.createRange();
  range.setStartAfter(left);
  range.setEndBefore(right);
  const between = range.cloneContents();
  between.querySelectorAll(`[${PILL_HOST_ATTR}]`).forEach((n) => n.remove());
  if (between.querySelector(BLOCK_ELEMENTS)) return false;
  return ONLY_SPACING.test(between.textContent ?? "");
}

/** Splits citations (in document order) into runs of adjacent citations. */
export function splitIntoRuns(links: CitationLink[]): CitationLink[][] {
  const runs: CitationLink[][] = [];
  links.forEach((link, i) => {
    const previous = links[i - 1];
    if (previous && areAdjacent(previous.anchor, link.anchor)) {
      runs[runs.length - 1].push(link);
    } else {
      runs.push([link]);
    }
  });
  return runs;
}

/** Groups one run by exact host, in order of first appearance. */
export function groupByHost(run: CitationLink[]): CitationGroup[] {
  const groups = new Map<string, CitationGroup>();
  run.forEach((link) => {
    const group = groups.get(link.host) ?? { host: link.host, links: [] };
    group.links.push(link);
    groups.set(link.host, group);
  });
  return [...groups.values()];
}

export function findCitationGroups(root: Element): CitationGroup[] {
  return splitIntoRuns(findCitationLinks(root)).flatMap(groupByHost);
}
