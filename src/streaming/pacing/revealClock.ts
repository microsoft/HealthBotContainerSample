import type { MessageState } from "../../reducer/models";
import { REVEAL_TICK_MS } from "./constants";
import type { Timers } from "../timers";
import type { Pacer } from "./models";
import {
  advance,
  createPacer,
  isSettled,
  revealAll,
  setTarget,
  toPacedView,
} from "./pacer";

export interface RevealClock {
  sync(state: MessageState): void;
  start(onTick: () => void): void;
  stop(): void;
  reset(): void;
  flush(): void;
  isDone(): boolean;
  view(state: MessageState): MessageState;
}

export function createRevealClock(timers: Timers): RevealClock {
  const { setTimeout, clearTimeout, now } = timers;

  let answer = createPacer();
  const steps = new Map<string, Pacer>();
  let loop: number | null = null;
  let lastTick = 0;
  let onTick: () => void = () => undefined;

  function pacers(): Pacer[] {
    return [answer, ...steps.values()];
  }

  function allSettled(): boolean {
    return pacers().every(isSettled);
  }

  function stop() {
    if (loop) {
      clearTimeout(loop);
      loop = null;
    }
  }

  function reset() {
    stop();
    answer = createPacer();
    steps.clear();
  }

  function sync(state: MessageState) {
    setTarget(answer, state.answerText);
    const live = new Set<string>();
    for (const step of state.reasoningSteps) {
      live.add(step.id);
      let pacer = steps.get(step.id);
      if (!pacer) {
        pacer = createPacer();
        steps.set(step.id, pacer);
      }
      setTarget(pacer, step.detail);
    }
    for (const id of [...steps.keys()]) {
      if (!live.has(id)) {
        steps.delete(id);
      }
    }
  }

  function tick() {
    loop = null;
    const t = now();
    const elapsed = t - lastTick;
    lastTick = t;
    for (const pacer of pacers()) {
      advance(pacer, elapsed);
    }
    onTick();
    if (!loop && !allSettled()) {
      loop = setTimeout(tick, REVEAL_TICK_MS);
    }
  }

  function start(callback: () => void) {
    onTick = callback;
    if (!loop && !allSettled()) {
      lastTick = now() - REVEAL_TICK_MS;
      tick();
    }
  }

  return {
    sync,
    start,
    stop,
    reset,
    flush: () => pacers().forEach(revealAll),
    isDone: allSettled,
    view: (state) => toPacedView(state, answer, steps),
  };
}
