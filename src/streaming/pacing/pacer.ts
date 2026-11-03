import type { MessageState } from "../../reducer/models";
import { REVEAL_CATCH_UP_MS, REVEAL_CHARS_PER_SEC } from "./constants";
import type { Pacer } from "./models";

export function createPacer(): Pacer {
  return { target: "", shown: 0, carry: 0 };
}

function backlog(pacer: Pacer): number {
  return pacer.target.length - pacer.shown;
}

export function isSettled(pacer: Pacer): boolean {
  return backlog(pacer) <= 0;
}

export function visibleText(pacer: Pacer): string {
  return pacer.target.slice(0, pacer.shown);
}

export function setTarget(pacer: Pacer, text: string): void {
  pacer.target = text;
  if (pacer.shown > text.length) {
    pacer.shown = text.length;
  }
}

export function revealAll(pacer: Pacer): void {
  pacer.shown = pacer.target.length;
  pacer.carry = 0;
}

export function advance(pacer: Pacer, elapsedMs: number): void {
  const remaining = backlog(pacer);
  if (remaining <= 0) {
    pacer.carry = 0;
    return;
  }

  // A steady base pace, plus enough extra to clear the backlog in about REVEAL_CATCH_UP_MS.
  const rate = REVEAL_CHARS_PER_SEC + (remaining * 1000) / REVEAL_CATCH_UP_MS;
  const owed = (rate * Math.max(0, elapsedMs)) / 1000 + pacer.carry;
  const step = Math.min(Math.floor(owed), remaining);
  pacer.shown += step;
  pacer.carry = step === remaining ? 0 : owed - step;
}

export function toPacedView(
  state: MessageState,
  answer: Pacer,
  steps: ReadonlyMap<string, Pacer>
): MessageState {
  return {
    ...state,
    answerText: visibleText(answer),
    reasoningSteps: state.reasoningSteps.map((step) => {
      const pacer = steps.get(step.id);
      if (!pacer) {
        return step;
      }
      return {
        ...step,
        detail: visibleText(pacer),
        status: step.status === "done" && isSettled(pacer) ? "done" : "active",
      };
    }),
  };
}
