import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway, ServiceState } from "@/gateway/types";

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

  it("snaps the switch back when the OS refuses the change", async () => {
    const base = createMockGateway();
    const gateway: Gateway = {
      ...base,
      // Stands in for networksetup failing: the Go side rejects and never
      // persists the flag.
      updateSettings: () => Promise.reject(new Error("networksetup 拒绝了请求")),
    };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("网络");

    const toggle = screen.getByRole("switch", { name: "系统代理" });
    expect(toggle).toBeChecked();
    await userEvent.click(toggle);

    await waitFor(() => expect(screen.getByRole("switch", { name: "系统代理" })).toBeChecked());
  });

  it("offers to install the daemon when TUN cannot work yet", async () => {
    const base = createMockGateway();
    const gateway: Gateway = {
      ...base,
      serviceStatus: () => Promise.resolve({ state: "missing" }),
      updateSettings: () => Promise.reject(new Error("TUN 需要系统服务")),
    };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("网络");

    const install = await screen.findByRole("button", { name: "安装服务" });
    expect(install).toBeInTheDocument();

    // Turning TUN on without the daemon is refused; the switch snaps back.
    await userEvent.click(screen.getByRole("switch", { name: "TUN 模式" }));
    await waitFor(() => expect(screen.getByRole("switch", { name: "TUN 模式" })).not.toBeChecked());
  });

  it("installs the daemon and flips the row into the running state", async () => {
    const base = createMockGateway();
    let state: ServiceState = "missing";
    const gateway: Gateway = {
      ...base,
      serviceStatus: () => Promise.resolve({ state }),
      installService: () => {
        state = "running";
        return Promise.resolve();
      },
    };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("网络");

    await userEvent.click(await screen.findByRole("button", { name: "安装服务" }));

    expect(await screen.findByRole("button", { name: "服务运行中 · 卸载" })).toBeInTheDocument();
  });

  it("disables TUN where the platform has no daemon", async () => {
    const base = createMockGateway();
    const gateway: Gateway = {
      ...base,
      serviceStatus: () => Promise.resolve({ state: "unsupported" }),
    };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "设置" }));
    await screen.findByText("网络");

    expect(await screen.findByText("当前系统不支持")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "TUN 模式" })).toBeDisabled();
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
