import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MessageView, Message } from "./Message";
import {
  createInitialMessageState,
  type MessageState,
} from "../../reducer/models";

const state = (over: Partial<MessageState>): MessageState => ({
  ...createInitialMessageState(),
  ...over,
});

describe("<MessageView>", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("progress variant renders the thinking trace", () => {
    render(
      <MessageView
        state={state({
          variant: "progress",
          reasoningSteps: [
            {
              id: "a",
              label: "Looking it up",
              status: "active",
              detail: "",
              sources: [],
            },
          ],
        })}
      />
    );
    expect(screen.getByText("Thinking Process · 1 step")).toBeTruthy();
    expect(screen.getByText("Looking it up")).toBeTruthy();
  });

  it("answer variant renders the trace above Web Chat's own rendering", () => {
    render(
      <Message
        state={state({
          variant: "answer",
          reasoningSteps: [
            {
              id: "a",
              label: "Looking it up",
              status: "done",
              detail: "",
              sources: [],
            },
          ],
        })}
        renderDefault={() => <p>the answer</p>}
      />
    );
    expect(screen.getByText("Thinking Process · 1 step")).toBeTruthy();
    expect(screen.getByText("the answer")).toBeTruthy();
  });

  it("error variant defers entirely to the bot's own message", () => {
    render(
      <Message
        state={state({ variant: "error", answerText: "It broke." })}
        renderDefault={() => <p>bot error text</p>}
      />
    );
    expect(screen.getByText("bot error text")).toBeTruthy();
    expect(screen.queryByText("It broke.")).toBeNull();
  });
});
