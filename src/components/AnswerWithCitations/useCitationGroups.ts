import { useEffect, useRef, useState, type RefObject } from "react";
import {
  findCitationGroups,
  PILL_HOST_ATTR,
  type CitationGroup,
  type CitationLink,
} from "./citationRuns";

export interface CitationGroupMount {
  key: string;
  /** Inline span inserted before the group's first citation; the pill portals into it. */
  container: HTMLSpanElement;
  host: string;
  links: CitationLink[];
}

export const HIDDEN_ANCHOR_CLASS = "has-cite__hidden";

const sameAnchors = (a: CitationLink[], b: CitationLink[]) =>
  a.length === b.length && a.every((link, i) => link.anchor === b[i].anchor);

function isCurrent(
  mounts: CitationGroupMount[],
  groups: CitationGroup[],
  root: Element
) {
  return (
    mounts.length === groups.length &&
    mounts.every(
      (mount, i) =>
        root.contains(mount.container) &&
        sameAnchors(mount.links, groups[i].links)
    )
  );
}

// Scans a rendered answer for runs of adjacent citations and mounts one pill per host group.
// The original anchors stay in the DOM (hidden) so a Web Chat re-render is detected and rescanned.
export function useCitationGroups(
  containerRef: RefObject<HTMLElement | null>
): CitationGroupMount[] {
  const [mounts, setMounts] = useState<CitationGroupMount[]>([]);
  const mountsRef = useRef<CitationGroupMount[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const scan = () => {
      const groups = findCitationGroups(root);
      const previous = mountsRef.current;
      if (isCurrent(previous, groups, root)) return;

      const next = groups.map((group) => {
        const reused = previous.find(
          (mount) =>
            root.contains(mount.container) &&
            sameAnchors(mount.links, group.links)
        );
        if (reused) return reused;
        const container = document.createElement("span");
        container.setAttribute(PILL_HOST_ATTR, "");
        group.links[0].anchor.before(container);
        return {
          key: `cite-${seq.current++}`,
          container,
          host: group.host,
          links: group.links,
        };
      });

      previous
        .filter((mount) => !next.includes(mount))
        .forEach((mount) => mount.container.remove());
      const grouped = new Set(
        next.flatMap((mount) => mount.links.map((link) => link.anchor))
      );
      // A link that is no longer a grouped citation must become visible again.
      previous.forEach((mount) =>
        mount.links.forEach((link) => {
          if (!grouped.has(link.anchor)) {
            link.anchor.classList.remove(HIDDEN_ANCHOR_CLASS);
          }
        })
      );
      grouped.forEach((anchor) => anchor.classList.add(HIDDEN_ANCHOR_CLASS));
      mountsRef.current = next;
      setMounts(next);
    };

    scan();
    const observer = new MutationObserver(scan);
    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    return () => {
      observer.disconnect();
      mountsRef.current.forEach((mount) => mount.container.remove());
      mountsRef.current = [];
    };
  }, [containerRef]);

  return mounts;
}
