import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Profiles page", () => {
  it("lists both subscriptions with their usage", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));

    expect(await screen.findByText("机场 A · 主订阅")).toBeInTheDocument();
    expect(screen.getByText("机场 B · 备份")).toBeInTheDocument();
    expect(screen.getByText("当前使用")).toBeInTheDocument();
    expect(screen.getByText("128 GB / 200 GB")).toBeInTheDocument();
  });

  it("asks for confirmation before deleting a subscription", async () => {
    const base = createMockGateway();
    const removeProfile = vi.fn((id: string) => base.removeProfile(id));
    const gateway: Gateway = { ...base, removeProfile };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));

    await userEvent.click(await screen.findByRole("button", { name: "删除 机场 A · 主订阅" }));

    // First click only arms the confirmation; nothing is removed yet.
    expect(removeProfile).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "确认删除" }));

    expect(removeProfile).toHaveBeenCalledWith("p1");
    await waitFor(() => expect(screen.queryByText("机场 A · 主订阅")).not.toBeInTheDocument());
    expect(screen.getByText("机场 B · 备份")).toBeInTheDocument();
  });

  it("adds a subscription from a pasted URL", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));
    await screen.findByText("机场 A · 主订阅");

    await userEvent.click(screen.getByRole("button", { name: "新建订阅" }));
    await userEvent.type(
      screen.getByLabelText("订阅链接"),
      "https://new.example.com/sub?token=abc",
    );
    await userEvent.click(screen.getByRole("button", { name: "添加" }));

    expect(await screen.findByText("新订阅 3")).toBeInTheDocument();
  });

  it("repaints when a scheduled refresh changes the list", async () => {
    const gateway = createMockGateway();
    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));

    expect(await screen.findByText("3 小时前")).toBeInTheDocument();

    // The Go gateway emits gateway:profiles after a background refresh.
    await act(async () => {
      await gateway.refreshProfile("p1");
    });

    expect(await screen.findByText("刚刚")).toBeInTheDocument();
  });

  it("offers an import action when there is no subscription at all", async () => {
    const base = createMockGateway();
    const gateway: Gateway = { ...base, profiles: () => Promise.resolve([]) };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));

    expect(await screen.findByText("还没有订阅")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "导入订阅" }));
    expect(screen.getByLabelText("订阅链接")).toBeInTheDocument();
  });

  it("keeps the auto-update interval after leaving the page", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));
    await screen.findByText("自动更新");

    await userEvent.click(screen.getByRole("button", { name: "24h" }));
    expect(screen.getByRole("button", { name: "24h" })).toHaveAttribute("aria-pressed", "true");

    await userEvent.click(screen.getByRole("button", { name: "首页" }));
    await userEvent.click(screen.getByRole("button", { name: "订阅" }));

    expect(await screen.findByRole("button", { name: "24h" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
