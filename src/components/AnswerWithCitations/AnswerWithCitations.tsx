import { useRef, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CitationPill } from "../Citations/CitationPill/CitationPill";
import type { CitationSource } from "./citationSources";
import { useCitationGroups } from "./useCitationGroups";
import "./AnswerWithCitations.css";

interface AnswerWithCitationsProps {
  children: ReactNode;
  /** Citation number → title, from the answer card's sources list. */
  sources?: Map<number, CitationSource>;
}

// Wraps the bot's rendered answer and replaces each run of adjacent citations with one
// favicon pill per source host.
export function AnswerWithCitations({
  children,
  sources,
}: AnswerWithCitationsProps): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const mounts = useCitationGroups(ref);

  return (
    <div ref={ref} className="has-cite__scope">
      {children}
      {mounts.map((mount) =>
        createPortal(
          <CitationPill
            host={mount.host}
            links={mount.links.map((link) => ({
              number: link.number,
              url: link.url,
              ...sources?.get(link.number),
            }))}
          />,
          mount.container,
          mount.key
        )
      )}
    </div>
  );
}
