import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, render, screen, cleanup } from "@testing-library/react";
import { ThinkingProcess } from "./ThinkingProcess";
import type { ReasoningStep } from "../../reducer/models";

const step = (over: Partial<ReasoningStep>): ReasoningStep => ({
  id: "tc-1",
  label: "Searching guidelines",
  status: "active",
  detail: "",
  sources: [],
  ...over,
});

describe("<ThinkingProcess>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("renders nothing when there are no steps", () => {
    const { container } = render(<ThinkingProcess steps={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the outer summary with a pluralized step count", () => {
    render(<ThinkingProcess steps={[step({ id: "a" }), step({ id: "b" })]} />);
    expect(screen.getByText("Thinking Process · 2 steps")).toBeTruthy();
  });

  it("uses the singular form for one step", () => {
    render(<ThinkingProcess steps={[step({ id: "a" })]} />);
    expect(screen.getByText("Thinking Process · 1 step")).toBeTruthy();
  });

  it("shows each step label", () => {
    render(
      <ThinkingProcess
        steps={[
          step({ id: "a", label: "Reading article" }),
          step({ id: "b", label: "Checking dosage" }),
        ]}
      />
    );
    expect(screen.getByText("Reading article")).toBeTruthy();
    expect(screen.getByText("Checking dosage")).toBeTruthy();
  });

  it("shows an active step content live (open by default)", () => {
    render(
      <ThinkingProcess
        steps={[step({ id: "a", detail: "first line of detail" })]}
      />
    );
    expect(screen.getByText("first line of detail")).toBeTruthy();
  });

  it("folds a settled step to a one-line preview after the linger window", () => {
    render(
      <ThinkingProcess
        steps={[
          step({
            id: "a",
            status: "done",
            detail: "Preview line\nhidden rest",
          }),
        ]}
      />
    );
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByText("Preview line")).toBeTruthy();
    expect(screen.queryByText("Preview line\nhidden rest")).toBeNull();
  });

  it("ages a finished step off the live rail after it settles", () => {
    render(
      <ThinkingProcess
        steps={[
          step({
            id: "a",
            label: "Searching guidelines",
            status: "done",
          }),
        ]}
      />
    );
    expect(screen.getByText("Searching guidelines")).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(screen.queryByText("Searching guidelines")).toBeNull();
  });

  it("keeps a step on the live rail while its content is still streaming", () => {
    render(
      <ThinkingProcess
        steps={[
          step({
            id: "a",
            label: "Searching guidelines",
            status: "active",
            detail: "partial output",
          }),
        ]}
      />
    );
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.getByText("Searching guidelines")).toBeTruthy();
    expect(screen.getByText("partial output")).toBeTruthy();
  });

  it("keeps every step in the disclosure after it has left the live rail", () => {
    render(
      <ThinkingProcess
        steps={[
          step({ id: "a", label: "First step", status: "done" }),
          step({ id: "b", label: "Second step", status: "done" }),
        ]}
      />
    );
    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(screen.queryByText("First step")).toBeNull();

    act(() => {
      screen.getByRole("button", { name: /Thinking Process/ }).click();
    });
    expect(screen.getByText("First step")).toBeTruthy();
    expect(screen.getByText("Second step")).toBeTruthy();
  });

  it("hides the live rail once the answer has started", () => {
    render(
      <ThinkingProcess
        steps={[step({ id: "a", label: "Hidden step" })]}
        answerStarted
      />
    );
    expect(screen.queryByText("Hidden step")).toBeNull();
  });

  it("shows the steps again when a run restarts and reuses the same ids", () => {
    const { rerender } = render(
      <ThinkingProcess
        steps={[
          step({ id: "tc-1", label: "Searching guidelines", status: "done" }),
        ]}
      />
    );
    expect(screen.getByText("Searching guidelines")).toBeTruthy();

    // The finished step ages off the live rail.
    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(screen.queryByText("Searching guidelines")).toBeNull();

    // A restarted run resets the trace, then emits a step carrying the same id.
    rerender(<ThinkingProcess steps={[]} />);
    rerender(
      <ThinkingProcess
        steps={[step({ id: "tc-1", label: "Retrying search" })]}
      />
    );

    expect(screen.getByText("Retrying search")).toBeTruthy();
  });
});
