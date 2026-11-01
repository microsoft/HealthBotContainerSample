import type { CSSProperties } from "react";
import type { CitationCardLink } from "../CitationCard/CitationCard";

export interface CitationPillProps {
  host: string;
  links: CitationCardLink[];
}

/** Lets the pointer travel from the pill into the card without the card closing. */
export const CLOSE_GRACE_MS = 150;

/** Space between the pill and its card. */
export const CARD_GAP_PX = 6;

/** Minimum distance kept between the card and the viewport edges. */
export const VIEWPORT_EDGE_PX = 8;

/** The card renders hidden until its position has been measured. */
export const UNPOSITIONED_CARD: CSSProperties = { visibility: "hidden" };

/** Web Chat's Fluent theme root, which defines the --webchat-* color tokens. */
export const THEME_ROOT_SELECTOR = ".webchat-fluent";
