import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Home page", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders the current exit node in the hero", async () => {
    render(<App gateway={createMockGateway()} />);

    expect(await screen.findByText("香港 · IPLC 02")).toBeInTheDocument();
    expect(screen.getByText("已连接")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "系统代理" })).toBeChecked();
  });

  it("routes the system proxy toggle through the gateway", async () => {
    const base = createMockGateway();
    const setSystemProxy = vi.fn((on: boolean) => base.setSystemProxy(on));
    const gateway: Gateway = { ...base, setSystemProxy };

    render(<App gateway={gateway} />);

    await userEvent.click(await screen.findByRole("switch", { name: "系统代理" }));

    expect(setSystemProxy).toHaveBeenCalledWith(false);
    expect(screen.getByRole("switch", { name: "系统代理" })).not.toBeChecked();
    expect((await screen.findAllByText("未连接")).length).toBeGreaterThan(0);
  });

  it("switches the proxy mode through the gateway", async () => {
    const base = createMockGateway();
    const setMode = vi.fn((mode: "rule" | "global" | "direct") => base.setMode(mode));
    const gateway: Gateway = { ...base, setMode };

    render(<App gateway={gateway} />);

    await userEvent.click(await screen.findByRole("button", { name: "全局" }));

    expect(setMode).toHaveBeenCalledWith("global");
    expect(await screen.findByText(/全局模式 ·/)).toBeInTheDocument();
  });

  it("swaps the whole page for the error panel when the gateway fails", async () => {
    const base = createMockGateway();
    const gateway: Gateway = {
      ...base,
      status: () => Promise.reject(new Error("kernel down")),
    };

    render(<App gateway={gateway} />);

    expect(await screen.findByText("内核暂时不可用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "重启内核" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /打开日志/ })).toBeInTheDocument();
    expect(screen.queryByText("香港 · IPLC 02")).not.toBeInTheDocument();
  });

  it("re-queries the exit IP from the card's refresh button", async () => {
    const base = createMockGateway();
    const refreshExitIP = vi.fn(() => base.refreshExitIP());
    const gateway: Gateway = { ...base, refreshExitIP };

    render(<App gateway={gateway} />);
    await screen.findByText("香港 · IPLC 02");

    await userEvent.click(screen.getByRole("button", { name: "刷新出口信息" }));

    expect(refreshExitIP).toHaveBeenCalledTimes(1);
  });

  it("hides the native badge when the lookup cannot tell", async () => {
    const base = createMockGateway();
    const status = await base.status();
    const gateway: Gateway = {
      ...base,
      status: () =>
        Promise.resolve({
          ...status,
          exitAsn: "",
          exitRegion: "中国台湾",
          exitRegionCode: "TW",
          nativeIp: false,
        }),
    };

    render(<App gateway={gateway} />);

    expect(await screen.findByText("中国台湾")).toBeInTheDocument();
    expect(screen.queryByText("原生 IP")).not.toBeInTheDocument();
    expect(screen.queryByText("中转 IP")).not.toBeInTheDocument();
  });

  it("says the region is unknown when no lookup succeeded", async () => {
    const base = createMockGateway();
    const status = await base.status();
    const gateway: Gateway = {
      ...base,
      status: () =>
        Promise.resolve({ ...status, exitIp: "", exitAsn: "", exitRegion: "", nativeIp: false }),
    };

    render(<App gateway={gateway} />);

    expect(await screen.findByText("出口地区未获取")).toBeInTheDocument();
  });

  it("streams traffic into stat cards with one decimal after the first tick", async () => {
    vi.useFakeTimers();

    render(<App gateway={createMockGateway()} />);
    await act(async () => {}); // flush the status fetch

    // Skeleton, not zero, before the stream produces a sample.
    expect(screen.queryByText("88.2 MB/s")).not.toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // Hero chip + stat card both show the speed.
    expect(screen.getAllByText("88.2 MB/s")).toHaveLength(2);
    expect(screen.getAllByText("12.4 MB/s")).toHaveLength(2);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});

describe("Home page — first run", () => {
  it("offers to download a core when none is installed", async () => {
    const base = createMockGateway();
    let installed = false;
    const gateway: Gateway = {
      ...base,
      status: () => (installed ? base.status() : Promise.reject(new Error("内核未运行"))),
      coreStatus: () =>
        Promise.resolve({
          state: installed ? "ready" : "missing",
          version: installed ? "1.19.4" : "",
          latest: "1.19.4",
          path: "/cores/v1.19.4/mihomo",
          progress: installed ? 1 : 0,
        }),
      downloadCore: () => {
        installed = true;
        return Promise.resolve({
          state: "ready" as const,
          version: "1.19.4",
          latest: "1.19.4",
          path: "/cores/v1.19.4/mihomo",
          progress: 1,
        });
      },
    };

    render(<App gateway={gateway} />);

    expect(await screen.findByText("还没有内核")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "下载内核" }));

    // The kernel answers after the install, so the page switches to the hero.
    expect(await screen.findByText("已连接")).toBeInTheDocument();
  });
});
