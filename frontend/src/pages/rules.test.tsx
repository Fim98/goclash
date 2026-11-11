import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";

describe("Rules page", () => {
  it("filters by rule type, leaving only matching rows", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "规则" }));

    expect(await screen.findByText("youtube")).toBeInTheDocument();

    // RULE-SET holds the REJECT row (reject-ads); everything else must go.
    await userEvent.click(screen.getByRole("button", { name: /^RULE-SET/ }));

    expect(screen.getByText("reject-ads")).toBeInTheDocument();
    expect(screen.getByText("proxy-gfw")).toBeInTheDocument();
    expect(screen.queryByText("youtube")).not.toBeInTheDocument();
    expect(screen.queryByText("google.com")).not.toBeInTheDocument();
  });

  it("keeps the MATCH fallback in the inverted ink row", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "规则" }));

    const match = await screen.findByText("兜底 · 未命中任何规则");
    expect(match).toBeInTheDocument();
    expect(match.closest('[role="row"]')).toHaveClass("bg-ink");
  });

  it("narrows the table through the header search", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "规则" }));
    await screen.findByText("youtube");

    await userEvent.type(screen.getByLabelText("搜索域名或 IP"), "github");

    expect(screen.getByText("github.com")).toBeInTheDocument();
    expect(screen.queryByText("youtube")).not.toBeInTheDocument();
  });
});
