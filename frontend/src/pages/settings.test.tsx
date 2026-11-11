import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Settings page", () => {
  it("writes the system proxy switch through and updates the home hero", async () => {
    const base = createMockGateway();
    const updateSettings = vi.fn((patch: Parameters<Gateway["updateSettings"]>[0]) =>
      base.updateSettings(patch),
    );
    const gateway: Gateway = { ...base, updateSettings };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("网络");

    await userEvent.click(screen.getByRole("switch", { name: "系统代理" }));

    expect(updateSettings).toHaveBeenCalledWith({ systemProxy: false });

    await userEvent.click(screen.getByRole("button", { name: "首页" }));

    expect((await screen.findAllByText("未连接")).length).toBeGreaterThan(0);
  });

  it("keeps the theme options that are not implemented disabled", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("外观");

    expect(screen.getByRole("button", { name: "浅色" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "深色" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "跟随" })).toBeDisabled();
  });

  it("persists a toggle across page switches", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("系统");

    const silent = screen.getByRole("switch", { name: "静默启动" });
    expect(silent).not.toBeChecked();
    await userEvent.click(silent);

    // Scope to the sidebar: the mode segmented also has a 规则 button.
    const nav = screen.getByRole("navigation", { name: "主导航" });
    await userEvent.click(within(nav).getByRole("button", { name: "规则" }));
    await userEvent.click(within(nav).getByRole("button", { name: "设置" }));

    expect(await screen.findByRole("switch", { name: "静默启动" })).toBeChecked();
  });
});
