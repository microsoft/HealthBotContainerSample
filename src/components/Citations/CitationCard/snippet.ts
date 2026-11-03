// The server suffixes repeated titles with " (1)", " (2)"; the page text never has it.
const DUPLICATE_TITLE_SUFFIX = /\s\(\d+\)$/;
const LEADING_SEPARATORS = /^[\s\-–—|:;,•·→←<>]+/;

const normalize = (text: string) => text.replace(/\s+/g, " ").trim();

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const titlePattern = (title: string) =>
  new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegExp(title)}(?=$|[^\\p{L}\\p{N}])`,
    "iu"
  );

export function removeTitle(snippet: string, title?: string): string {
  const text = normalize(snippet);
  const heading = normalize((title ?? "").replace(DUPLICATE_TITLE_SUFFIX, ""));
  if (!heading) return text;
  const pattern = titlePattern(heading);
  if (!pattern.test(text)) return text;
  return normalize(text.replace(pattern, "$1 ")).replace(
    LEADING_SEPARATORS,
    ""
  );
}

export function cardSnippet(
  snippet?: string,
  title?: string
): string | undefined {
  const text = snippet ? removeTitle(snippet, title) : "";
  return text || undefined;
}
