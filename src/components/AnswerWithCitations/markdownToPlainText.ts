import { micromark, type Options } from "micromark";
import { gfm, gfmHtml } from "micromark-extension-gfm";

export function markdownToPlainText(markdown: string): string {
  const html = micromark(markdown, {
    extensions: [gfm()],
    htmlExtensions: [gfmHtml()],
  } as Options);
  const text = new DOMParser().parseFromString(html, "text/html").body
    .textContent;
  return (text ?? "").replace(/[\s\u200B\uFEFF]+/g, " ").trim();
}
