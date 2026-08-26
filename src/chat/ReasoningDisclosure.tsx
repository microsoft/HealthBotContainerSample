/*
 * ReasoningDisclosure — the collapsible ordered reasoning trace.
 *
 * One component, two contexts (clarify: thinking bucket ① = A1 + F2 + F1):
 *   • variant="rail"    → F2 non-blocking reasoning rail shown under the thinking chip
 *                         while the agent works. Collapsed by default (Q2) so it never
 *                         blocks the conversation; the user expands it to watch steps.
 *   • variant="history" → F1 collapsible thinking history rendered ABOVE the final answer
 *                         (activityMiddleware). Same ordered trace, revealed on demand so
 *                         nothing is lost once the answer arrives.
 *
 * Both read the SAME MessageState.reasoningSteps produced by the reducer, so the live
 * rail and the post-answer history are guaranteed consistent — they are literally the
 * same data at two points in time.
 *
 * The open/closed flag is local React UI state (useState): it is view-only interaction,
 * not part of the streamed MessageState, so it correctly lives in the component.
 */

import { useState } from 'react';
import type { ReactElement } from 'react';
import type { ReasoningStep } from '../agui/messageState';
import '../styles/ReasoningDisclosure.css';

interface ReasoningDisclosureProps {
  steps: ReasoningStep[];
  /** rail = live under the chip (F2); history = above the answer (F1). */
  variant: 'rail' | 'history';
  /** Start expanded? Default false — Q2: collapsed by default. */
  defaultOpen?: boolean;
}

/**
 * Q5=B: render the FULL ordered list, latest step emphasised.
 * To switch to Q5=C (only the currently-active step), change this one line to:
 *     return steps.filter((s) => s.status === 'active');
 */
function visibleSteps(steps: ReasoningStep[]): ReasoningStep[] {
  return steps;
}

export function ReasoningDisclosure({
  steps,
  variant,
  defaultOpen = false,
}: ReasoningDisclosureProps): ReactElement | null {
  const [open, setOpen] = useState(defaultOpen);

  if (steps.length === 0) {
    return null;
  }

  const visible = visibleSteps(steps);
  const lastIndex = visible.length - 1;
  const count = visible.length;

  return (
    <div className={`has-reason has-reason--${variant}`} data-open={open}>
      <button
        type="button"
        className="has-reason__toggle"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          className="has-reason__caret"
          viewBox="0 0 12 12"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 2l4 4-4 4" />
        </svg>
        <span className="has-reason__summary">
          Thinking Process · {count} step{count === 1 ? '' : 's'}
        </span>
      </button>

      {open && (
        <ol className="has-reason__steps">
          {visible.map((step, i) => (
            <li
              key={step.id}
              className="has-reason__step"
              data-status={step.status}
              data-latest={i === lastIndex}
            >
              <span className="has-reason__dot" aria-hidden="true" />
              {step.label}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
