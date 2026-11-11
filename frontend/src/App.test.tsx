import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("App shell", () => {
  it("marks the active navigation item", () => {
    render(<App />);

    expect(screen.getByRole("button", { name: /首页/ })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: /代理/ })).not.toHaveAttribute("aria-current");
  });

  it("switches pages from the sidebar", async () => {
    render(<App />);

    await userEvent.click(screen.getByRole("button", { name: "代理" }));

    expect(screen.getByRole("heading", { name: "代理" })).toBeInTheDocument();
    expect(await screen.findByText("节点选择")).toBeInTheDocument();
    expect(screen.queryByText(/本页施工中/)).not.toBeInTheDocument();
  });

  it("shows the kernel status once the gateway answers", async () => {
    render(<App />);

    expect(await screen.findByText("mihomo 运行中")).toBeInTheDocument();
    expect(screen.getByText(/运行 4h 12m · 混合端口 7890/)).toBeInTheDocument();
  });

  it("shows the system proxy hint in the title bar", async () => {
    render(<App />);

    expect(await screen.findByText("系统代理已接管")).toBeInTheDocument();
  });
});
