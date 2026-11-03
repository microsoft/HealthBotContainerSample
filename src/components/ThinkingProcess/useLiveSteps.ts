import { useEffect, useRef, useState } from "react";
import type { ReasoningStep } from "../../reducer/models";

/** How long a finished step stays on the live rail before it ages off. */
const STEP_LINGER_MS = 5000;

/** How long the leaving animation runs before the row is removed. */
const EXIT_MS = 300;

export interface LiveRow {
  id: string;
  leaving: boolean;
}

// A finished step ages off the live rail so a long run cannot grow without bound. A step that
// is still streaming stays put — the clock only starts once it is done.
export function useLiveSteps(steps: ReasoningStep[]): LiveRow[] {
  const [rows, setRows] = useState<LiveRow[]>([]);
  const seen = useRef<Set<string>>(new Set());
  const settled = useRef<Set<string>>(new Set());
  const timers = useRef<number[]>([]);

  // A restarted run clears the trace. The ids must be forgotten with it: the new run reuses
  // the same step ids, so a surviving `seen` entry would mark them as already shown and they
  // would never reach the rail.
  useEffect(() => {
    if (steps.length > 0) {
      return;
    }
    seen.current.clear();
    settled.current.clear();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    setRows((prev) => (prev.length === 0 ? prev : []));
  }, [steps]);

  useEffect(() => {
    steps.forEach((step) => {
      if (!seen.current.has(step.id)) {
        seen.current.add(step.id);
        setRows((prev) => [...prev, { id: step.id, leaving: false }]);
      }

      if (step.status !== "done" || settled.current.has(step.id)) {
        return;
      }
      settled.current.add(step.id);
      timers.current.push(
        window.setTimeout(() => {
          setRows((prev) =>
            prev.map((row) =>
              row.id === step.id ? { ...row, leaving: true } : row
            )
          );
          timers.current.push(
            window.setTimeout(
              () => setRows((prev) => prev.filter((row) => row.id !== step.id)),
              EXIT_MS
            )
          );
        }, STEP_LINGER_MS)
      );
    });
  }, [steps]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  return rows;
}
