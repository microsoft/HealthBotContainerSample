import { markdownToPlainText } from "./markdownToPlainText";

interface CardAttachment {
  contentType?: string;
  content?: unknown;
}

export interface CitationSource {
  title: string;
  snippet?: string;
}

const ADAPTIVE_CARD = "application/vnd.microsoft.card.adaptive";
const CONTENT_ID_SUFFIX = "_content";

type Node = Record<string, unknown>;

const isNode = (value: unknown): value is Node =>
  typeof value === "object" && value !== null;

const itemsOf = (node: unknown): unknown[] =>
  isNode(node) && Array.isArray(node.items) ? (node.items as unknown[]) : [];

const firstItem = (node: unknown): Node | undefined => {
  const first = itemsOf(node)[0];
  return isNode(first) ? first : undefined;
};

const text = (value: unknown) => String(value ?? "").trim();

const isSourceLink = (item: Node) =>
  typeof item.color === "string" && item.color.toLowerCase() === "accent";

// A sources-list row is a ColumnSet: [TextBlock "N"] [Container > TextBlock title] [chevrons…].
function readSourceRow(
  node: Node
): { number: number; title: string } | undefined {
  if (node.type !== "ColumnSet" || !Array.isArray(node.columns))
    return undefined;
  const numberBlock = firstItem(node.columns[0]);
  const titleBlock = firstItem(firstItem(node.columns[1]));
  if (numberBlock?.type !== "TextBlock" || titleBlock?.type !== "TextBlock") {
    return undefined;
  }
  const number = text(numberBlock.text);
  const title = text(titleBlock.text);
  return /^\d+$/.test(number) && title
    ? { number: Number(number), title }
    : undefined;
}

function readSnippet(content: Node): string | undefined {
  const lines = itemsOf(firstItem(content)).flatMap((item) => {
    if (!isNode(item) || isSourceLink(item) || item.isSubtle) return [];
    if (item.type === "TextBlock")
      return [markdownToPlainText(text(item.text))];
    if (item.type === "RichTextBlock" && Array.isArray(item.inlines)) {
      return item.inlines.map((inline) =>
        isNode(inline) ? text(inline.text) : ""
      );
    }
    return [];
  });
  const snippet = lines.join(" ").replace(/\s+/g, " ").trim();
  return snippet || undefined;
}

function walk(node: unknown, visit: (node: Node) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
  } else if (isNode(node)) {
    visit(node);
    Object.values(node).forEach((child) => walk(child, visit));
  }
}

export function citationSources(
  attachments: CardAttachment[] | undefined
): Map<number, CitationSource> {
  const sources = new Map<number, CitationSource>();
  const rowIds = new Map<string, number>();
  const contents = new Map<string, Node>();

  (attachments ?? [])
    .filter((attachment) => attachment.contentType === ADAPTIVE_CARD)
    .forEach((attachment) =>
      walk(attachment.content, (node) => {
        const row = readSourceRow(node);
        if (row) {
          sources.set(row.number, { title: row.title });
          if (typeof node.id === "string") rowIds.set(node.id, row.number);
        } else if (
          typeof node.id === "string" &&
          node.id.endsWith(CONTENT_ID_SUFFIX)
        ) {
          contents.set(node.id.slice(0, -CONTENT_ID_SUFFIX.length), node);
        }
      })
    );

  rowIds.forEach((number, id) => {
    const content = contents.get(id);
    const snippet = content && readSnippet(content);
    const source = sources.get(number);
    if (snippet && source) sources.set(number, { ...source, snippet });
  });
  return sources;
}
