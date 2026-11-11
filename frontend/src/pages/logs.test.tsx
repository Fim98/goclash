import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Logs page", () => {
  it("replays the buffer on attach and filters down to errors", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "日志" }));

    expect(await screen.findByText(/www\.youtube\.com/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^error/ }));

    expect(screen.getByText(/连接超时/)).toBeInTheDocument();
    expect(screen.queryByText(/www\.youtube\.com/)).not.toBeInTheDocument();
  });

  it("clears the buffer through the gateway and shows the empty state", async () => {
    const base = createMockGateway();
    const clearLogs = vi.fn(() => base.clearLogs());
    const gateway: Gateway = { ...base, clearLogs };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "日志" }));
    await screen.findByText(/www\.youtube\.com/);

    await userEvent.click(screen.getByRole("button", { name: "清空" }));

    expect(clearLogs).toHaveBeenCalled();
    expect(await screen.findByText("还没有日志输出")).toBeInTheDocument();
  });

  it("opens the log directory through the gateway", async () => {
    const base = createMockGateway();
    const openLogDirectory = vi.fn(() => base.openLogDirectory());
    const gateway: Gateway = { ...base, openLogDirectory };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "日志" }));
    await screen.findByText(/www\.youtube\.com/);

    await userEvent.click(screen.getByRole("button", { name: /日志目录/ }));

    expect(openLogDirectory).toHaveBeenCalled();
  });
});
