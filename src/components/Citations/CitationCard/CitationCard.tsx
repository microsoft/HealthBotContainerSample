import {
  forwardRef,
  type CSSProperties,
  type PointerEventHandler,
  type ReactElement,
} from "react";
import { CitationChip } from "../CitationChip/CitationChip";
import { displayHost } from "../CitationChip/favicon";
import { cardSnippet } from "./snippet";
import "./CitationCard.css";

export interface CitationCardLink {
  number: number;
  url: string;
  title?: string;
  snippet?: string;
}

interface CitationCardProps {
  id: string;
  host: string;
  links: CitationCardLink[];
  index: number;
  onIndexChange: (index: number) => void;
  style?: CSSProperties;
  onPointerEnter?: PointerEventHandler<HTMLDivElement>;
  onPointerLeave?: PointerEventHandler<HTMLDivElement>;
}

const Chevron = ({ flip }: { flip?: boolean }) => (
  <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
    <path
      d={flip ? "M6 3.5 10.5 8 6 12.5" : "M10 3.5 5.5 8 10 12.5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// Shows one source at a time; the arrows page through every citation of the same host.
export const CitationCard = forwardRef<HTMLDivElement, CitationCardProps>(
  function CitationCard(
    {
      id,
      host,
      links,
      index,
      onIndexChange,
      style,
      onPointerEnter,
      onPointerLeave,
    },
    ref
  ): ReactElement {
    const link = links[index];
    const snippet = cardSnippet(link.snippet, link.title);
    const label = displayHost(host);
    const count = links.length;

    return (
      <div
        ref={ref}
        id={id}
        role="group"
        aria-label={`Sources from ${label}`}
        className="has-cite-card"
        style={style}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        <div className="has-cite-card__head">
          <a
            className="has-cite-card__source"
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
          >
            <CitationChip url={link.url} />
            <span className="has-cite-card__host">{label}</span>
          </a>
          {count > 1 && (
            <span className="has-cite-card__nav">
              {/* Keyboard users page with the arrow keys on the pill, so these stay out of the tab order. */}
              <button
                type="button"
                tabIndex={-1}
                aria-label="Previous source"
                disabled={index === 0}
                onClick={() => onIndexChange(index - 1)}
              >
                <Chevron />
              </button>
              <span className="has-cite-card__count" aria-live="polite">
                {index + 1}/{count}
              </span>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Next source"
                disabled={index === count - 1}
                onClick={() => onIndexChange(index + 1)}
              >
                <Chevron flip />
              </button>
            </span>
          )}
        </div>
        {link.title && <div className="has-cite-card__title">{link.title}</div>}
        {snippet && <div className="has-cite-card__snippet">{snippet}</div>}
      </div>
    );
  }
);
