import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import App from "@/App";
import { createMockGateway } from "@/gateway/mock";
import type { Gateway } from "@/gateway/types";

describe("Connections page", () => {
  it("routes a single close through the gateway and drops the row", async () => {
    const base = createMockGateway();
    const closeConnection = vi.fn((id: string) => base.closeConnection(id));
    const gateway: Gateway = { ...base, closeConnection };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "连接" }));

    expect(await screen.findByText("www.youtube.com:443")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "关闭 www.youtube.com:443" }));

    expect(closeConnection).toHaveBeenCalledWith("c1");
    await waitFor(() => expect(screen.queryByText("www.youtube.com:443")).not.toBeInTheDocument());
  });

  it("filters by kind and keeps the counts in the chips", async () => {
    render(<App gateway={createMockGateway()} />);
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    await screen.findByText("www.youtube.com:443");

    expect(screen.getByRole("button", { name: /^全部 9$/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^直连/ }));

    expect(screen.getByText("192.168.1.12:5353")).toBeInTheDocument();
    expect(screen.queryByText("www.youtube.com:443")).not.toBeInTheDocument();
  });

  it("closes everything and lands on the empty state", async () => {
    const base = createMockGateway();
    const closeAllConnections = vi.fn(() => base.closeAllConnections());
    const gateway: Gateway = { ...base, closeAllConnections };

    render(<App gateway={gateway} />);
    await userEvent.click(screen.getByRole("button", { name: "连接" }));
    await screen.findByText("www.youtube.com:443");

    await userEvent.click(screen.getByRole("button", { name: "全部关闭" }));

    expect(closeAllConnections).toHaveBeenCalled();
    expect(await screen.findByText("当前没有活动连接")).toBeInTheDocument();
  });
});
