import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

import { TrayApp } from "./tray-app";

// The popup talks to the Go host through Wails events; tests assert the emits.
const { emit } = vi.hoisted(() => ({ emit: vi.fn() }));
vi.mock("@wailsio/runtime", () => ({ Events: { Emit: emit } }));

describe("Tray popup", () => {
  beforeEach(() => {
    emit.mockClear();
  });

  it("shows the state and the four lowest-latency nodes", async () => {
    render(<TrayApp gateway={createMockGateway()} />);

    expect(await screen.findByText("已连接")).toBeInTheDocument();
    expect(screen.getByText(/香港 · IPLC 02 · 38 ms/)).toBeInTheDocument();

    for (const name of ["台湾 · 台北 01", "香港 · IPLC 02", "日本 · 东京 01", "韩国 · 首尔 01"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    // The 60th-percentile nodes stay in the main window.
    expect(screen.queryByText("新加坡 · SG 03")).not.toBeInTheDocument();
    expect(screen.queryByText("美国 · 洛杉矶 02")).not.toBeInTheDocument();
  });

  it("selects a node through the gateway and follows the exit", async () => {
    const base = createMockGateway();
    const select = vi.fn((groupId: string, nodeName: string) => base.select(groupId, nodeName));
    const gateway: Gateway = { ...base, select };

    render(<TrayApp gateway={gateway} />);

    await userEvent.click(await screen.findByRole("button", { name: /台湾 · 台北 01/ }));

    expect(select).toHaveBeenCalledWith("proxy", "台湾 · 台北 01");
    expect(await screen.findByText(/台湾 · 台北 01 · 26 ms/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /台湾 · 台北 01/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("turns the system proxy off from the hero switch", async () => {
    const base = createMockGateway();
    const setSystemProxy = vi.fn((on: boolean) => base.setSystemProxy(on));
    const gateway: Gateway = { ...base, setSystemProxy };

    render(<TrayApp gateway={gateway} />);

    await userEvent.click(await screen.findByRole("switch", { name: "系统代理" }));

    expect(setSystemProxy).toHaveBeenCalledWith(false);
    expect(await screen.findByText("未连接")).toBeInTheDocument();
  });

  it("asks the host to hide itself or raise the main window", async () => {
    render(<TrayApp gateway={createMockGateway()} />);

    await userEvent.click(await screen.findByRole("button", { name: "关闭浮窗" }));
    expect(emit).toHaveBeenCalledWith("tray:hide");

    await userEvent.click(screen.getByRole("button", { name: /打开主界面/ }));
    expect(emit).toHaveBeenCalledWith("tray:open-main");
  });
});
