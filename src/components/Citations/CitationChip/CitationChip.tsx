import { useState, type ReactElement } from "react";
import { faviconUrl } from "./favicon";
import "./CitationChip.css";

interface CitationChipProps {
  url: string;
}

// Decorative favicon for a cited source; the surrounding control carries the accessible name.
export function CitationChip({ url }: CitationChipProps): ReactElement {
  const [failed, setFailed] = useState(false);
  const icon = failed ? undefined : faviconUrl(url);

  return (
    <span className="has-cite__chip" aria-hidden="true">
      {icon ? (
        <img
          className="has-cite__icon"
          src={icon}
          alt=""
          loading="lazy"
          // The web chat URL carries the Direct Line token, so never send it as a referrer.
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="has-cite__globe" />
      )}
    </span>
  );
}
