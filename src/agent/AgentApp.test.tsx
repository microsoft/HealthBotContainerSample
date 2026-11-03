import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AgentApp from "./AgentApp";

const send = vi.fn();

// The real chat needs a live Direct Line connection; render only its sidebar here.
vi.mock("../chat/Chat", () => ({
  default: ({
    tokenPayload,
    renderSidebar,
  }: {
    tokenPayload: { isAgent?: boolean };
    renderSidebar: (send: (text: string) => void) => unknown;
  }) => (
    <div data-testid="chat" data-agent={String(tokenPayload.isAgent)}>
      {renderSidebar(send) as never}
    </div>
  ),
}));

function fakeJwt(payload: object): string {
  return ["h", btoa(JSON.stringify(payload)), "s"].join(".");
}

afterEach(() => {
  vi.unstubAllGlobals();
  send.mockClear();
});

describe("<AgentApp>", () => {
  it("logs in as an agent and posts the agent command messages", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      text: () =>
        Promise.resolve(
          fakeJwt({ userId: "a1", userName: "Ann", connectorToken: "t", isAgent: true }),
        ),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AgentApp />);
    await userEvent.type(screen.getByLabelText(/Enter your name/), "Ann");
    await userEvent.type(screen.getByLabelText(/login ID/), "a1");
    fireEvent.click(screen.getByRole("button", { name: "Log In" }));

    await waitFor(() => expect(screen.queryByTestId("chat")).not.toBeNull());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/chatBot?");
    expect(url).toContain("userId=a1");
    expect(url).toContain("userName=Ann");
    expect(url).toContain("agent=true");
    expect(init).toEqual({ method: "POST" });
    expect(screen.getByTestId("chat").getAttribute("data-agent")).toBe("true");

    const expected: Record<string, string> = {
      List: "list",
      Connect: "connect",
      "End conversation": "disconnect",
      Options: "options",
    };
    for (const [label, message] of Object.entries(expected)) {
      fireEvent.click(screen.getByRole("button", { name: label }));
      expect(send).toHaveBeenLastCalledWith(message);
    }
  });

  it("does not request a token before the agent logs in", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AgentApp />);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
