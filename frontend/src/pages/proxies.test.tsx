import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Proxies page", () => {
  it("marks the currently selected node", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "代理" }));

    const selected = await screen.findByRole("button", { name: /香港 · IPLC 02/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(selected).toHaveClass("bg-coral");
  });

  it("routes a node pick through the gateway and moves the selected state", async () => {
    const base = createMockGateway();
    const select = vi.fn((groupId: string, nodeName: string) => base.select(groupId, nodeName));
    const gateway: Gateway = { ...base, select };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "代理" }));

    const tokyo = await screen.findByRole("button", { name: /日本 · 东京 01/ });
    await userEvent.click(tokyo);

    expect(select).toHaveBeenCalledWith("proxy", "日本 · 东京 01");
    expect(await screen.findByRole("button", { name: /日本 · 东京 01/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("filters nodes by name across groups", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "代理" }));
    await screen.findByRole("button", { name: /香港 · IPLC 02/ });

    await userEvent.type(screen.getByLabelText("搜索节点"), "台北");

    expect(screen.getByRole("button", { name: /台湾 · 台北 01/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /台湾 · 台北 02/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /香港 · IPLC 02/ })).not.toBeInTheDocument();

    await userEvent.clear(screen.getByLabelText("搜索节点"));
    await userEvent.type(screen.getByLabelText("搜索节点"), "没有这个节点");

    expect(screen.getAllByText("无匹配节点")).toHaveLength(2);
  });

  it("sends the user to profiles when there is no subscription", async () => {
    const base = createMockGateway();
    const gateway: Gateway = { ...base, profiles: () => Promise.resolve([]) };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "代理" }));

    expect(await screen.findByText("还没有订阅")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "去订阅页" }));

    expect(screen.getByRole("heading", { name: "订阅" })).toBeInTheDocument();
  });
});
