import { describe, it, expect, afterEach } from "vitest";
import {
  render,
  cleanup,
  waitFor,
  fireEvent,
  screen,
} from "@testing-library/react";
import type { ReactElement } from "react";
import {
  createInitialMessageState,
  type MessageState,
} from "../../reducer/models";
import { STREAM_ACTIVITY_ID_PREFIX } from "../wire";
import { activityMiddleware } from "./activityMiddleware";
import type { ActivityCard, LegacyRenderFunction } from "./models";

afterEach(cleanup);

const ADAPTIVE_CARD = "application/vnd.microsoft.card.adaptive";

const answerState: MessageState = {
  ...createInitialMessageState(),
  variant: "answer",
  reasoningSteps: [
    { id: "a", label: "Searching", status: "done", detail: "", sources: [] },
  ],
};

const sourcesList = {
  type: "ColumnSet",
  id: "ab12",
  columns: [
    { type: "Column", items: [{ type: "TextBlock", text: "1" }] },
    {
      type: "Column",
      items: [
        {
          type: "Container",
          items: [{ type: "TextBlock", text: "About Influenza | CDC" }],
        },
      ],
    },
  ],
};

const sourceBody = {
  type: "Container",
  id: "ab12_content",
  items: [
    {
      type: "Container",
      items: [{ type: "TextBlock", text: "**Flu** is a contagious illness." }],
    },
  ],
};

// Stands in for Web Chat's own rendering of the answer card.
const renderAnswer = () => () =>
  (
    <p>
      Flu vaccine.<a href="https://www.cdc.gov/flu/a">[1]</a>
      <a href="https://www.cdc.gov/flu/b">[2]</a>
    </p>
  );

function renderActivity(card: ActivityCard) {
  const render_ = activityMiddleware()(renderAnswer)(
    card
  ) as LegacyRenderFunction;
  return render(render_(undefined, undefined) as ReactElement);
}

describe("activityMiddleware citations", () => {
  it("renders pills for the paced final answer released with hasStreamReveal", async () => {
    const { container } = renderActivity({
      activity: {
        id: `${STREAM_ACTIVITY_ID_PREFIX}1`,
        attachments: [
          {
            contentType: ADAPTIVE_CARD,
            content: { body: [sourcesList, sourceBody] },
          },
        ],
        channelData: { hasStreamReveal: true, state: answerState },
      },
    });

    await waitFor(() =>
      expect(container.querySelector(".has-cite-pill")?.textContent).toBe(
        "cdc.gov+1"
      )
    );
    expect(container.textContent).toContain("Thinking Process");

    fireEvent.pointerOver(container.querySelector(".has-cite-pill")!, {
      pointerType: "mouse",
    });
    expect(screen.getByText("About Influenza | CDC")).toBeTruthy();
    expect(screen.getByText("Flu is a contagious illness.")).toBeTruthy();
  });

  it("keeps an activity suppressed when Web Chat does not render it", () => {
    const suppressed = activityMiddleware()(() => false)({
      activity: {
        id: `${STREAM_ACTIVITY_ID_PREFIX}3`,
        channelData: { state: answerState },
      },
    });
    expect(suppressed).toBe(false);
  });

  it("renders pills for a final answer without the reveal flag", async () => {
    const { container } = renderActivity({
      activity: {
        id: `${STREAM_ACTIVITY_ID_PREFIX}2`,
        channelData: { state: answerState },
      },
    });
    await waitFor(() =>
      expect(container.querySelector(".has-cite-pill")).toBeTruthy()
    );
  });
});
