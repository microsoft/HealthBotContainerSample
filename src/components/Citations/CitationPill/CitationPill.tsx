import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactElement,
} from "react";
import { createPortal } from "react-dom";
import { CitationCard } from "../CitationCard/CitationCard";
import { CitationChip } from "../CitationChip/CitationChip";
import { displayHost } from "../CitationChip/favicon";
import {
  CARD_GAP_PX,
  CLOSE_GRACE_MS,
  THEME_ROOT_SELECTOR,
  UNPOSITIONED_CARD,
  VIEWPORT_EDGE_PX,
  type CitationPillProps,
} from "./models";
import "./CitationPill.css";

let nextCardId = 0;

// Rendered inside the Fluent theme root so the card inherits the --webchat-* tokens.
function cardContainer(pill: HTMLElement | null): HTMLElement {
  return (
    (pill?.closest(THEME_ROOT_SELECTOR) as HTMLElement | null) ?? document.body
  );
}

export function CitationPill({ host, links }: CitationPillProps): ReactElement {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [position, setPosition] = useState<CSSProperties>(UNPOSITIONED_CARD);

  const pillRef = useRef<HTMLAnchorElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number>();
  const pointerType = useRef("");

  const cardId = useMemo(() => `has-cite-card-${nextCardId++}`, []);
  const count = links.length;
  const current = Math.min(index, count - 1);
  const label = displayHost(host);

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const show = () => {
    cancelClose();
    setOpen(true);
  };
  const hide = () => {
    cancelClose();
    setOpen(false);
  };
  const scheduleHide = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(
      () => setOpen(false),
      CLOSE_GRACE_MS
    );
  };

  const page = (next: number) => {
    setIndex(Math.max(0, Math.min(next, count - 1)));
    show();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    if (event.key === "Escape") {
      hide();
    } else if (event.key === "ArrowRight" && count > 1) {
      event.preventDefault();
      page(current + 1);
    } else if (event.key === "ArrowLeft" && count > 1) {
      event.preventDefault();
      page(current - 1);
    }
  };

  useEffect(() => () => window.clearTimeout(closeTimer.current), []);

  useEffect(() => {
    if (!open) return;
    const close = () => {
      window.clearTimeout(closeTimer.current);
      setOpen(false);
    };
    const isInside = (target: EventTarget | null) =>
      target instanceof Node &&
      Boolean(
        pillRef.current?.contains(target) || cardRef.current?.contains(target)
      );
    const onPointerDown = (event: PointerEvent) => {
      if (!isInside(event.target)) close();
    };
    // The card is position:fixed, so it would drift away from the pill on scroll or resize.
    const onScroll = (event: Event) => {
      if (!isInside(event.target)) close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  // Below the pill by default; flipped above when there is no room, and kept inside the viewport.
  useLayoutEffect(() => {
    const pill = pillRef.current;
    const card = cardRef.current;
    if (!open || !pill || !card) return;
    const anchor = pill.getBoundingClientRect();
    const { offsetWidth: width, offsetHeight: height } = card;
    const left = Math.max(
      VIEWPORT_EDGE_PX,
      Math.min(anchor.left, window.innerWidth - width - VIEWPORT_EDGE_PX)
    );
    const below = anchor.bottom + CARD_GAP_PX;
    const above = anchor.top - CARD_GAP_PX - height;
    const fitsBelow = below + height <= window.innerHeight - VIEWPORT_EDGE_PX;
    setPosition({
      top: fitsBelow || above < VIEWPORT_EDGE_PX ? below : above,
      left,
    });
  }, [open, current]);

  return (
    <>
      <a
        ref={pillRef}
        className="has-cite-pill"
        href={links[current].url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${label}, ${count} ${count === 1 ? "source" : "sources"}`}
        aria-expanded={open}
        aria-describedby={open ? cardId : undefined}
        // Remembers mouse vs touch vs pen so focus and click can tell them apart.
        onPointerDown={(event) => {
          pointerType.current = event.pointerType;
        }}
        // Hovering with a mouse or pen opens the card right away.
        onPointerEnter={(event) => {
          if (event.pointerType !== "touch") show();
        }}
        // Leaving the pill closes the card after a short grace period.
        onPointerLeave={(event) => {
          if (event.pointerType !== "touch") scheduleHide();
        }}
        // Keyboard focus opens the card; pointer focus is already handled by hover or tap.
        onFocus={() => {
          if (!pointerType.current) show();
        }}
        // Losing focus closes the card, unless focus moved into the card itself.
        onBlur={(event) => {
          if (!cardRef.current?.contains(event.relatedTarget as Node | null))
            scheduleHide();
        }}
        // Opens the current link; on touch the first tap shows the card instead.
        onClick={(event) => {
          if (pointerType.current === "touch" && !open) {
            event.preventDefault();
            show();
          }
          pointerType.current = "";
        }}
        // Arrow keys page through the links; Escape closes the card.
        onKeyDown={onKeyDown}
      >
        <CitationChip url={links[0].url} />
        <span className="has-cite-pill__label">{label}</span>
        {count > 1 && <span className="has-cite-pill__more">+{count - 1}</span>}
      </a>
      {open &&
        createPortal(
          <CitationCard
            ref={cardRef}
            id={cardId}
            host={host}
            links={links}
            index={current}
            // The card's arrows switch the current link.
            onIndexChange={page}
            style={position}
            // Moving into the card keeps it open.
            onPointerEnter={cancelClose}
            // Leaving the card closes it after the grace period.
            onPointerLeave={(event) => {
              if (event.pointerType !== "touch") scheduleHide();
            }}
          />,
          cardContainer(pillRef.current)
        )}
    </>
  );
}
