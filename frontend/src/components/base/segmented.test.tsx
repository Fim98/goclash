import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Segmented } from "./segmented";

const MODES = [
  { value: "rule", label: "规则" },
  { value: "global", label: "全局" },
  { value: "direct", label: "直连" },
] as const;

describe("Segmented", () => {
  it("marks the selected option with aria-pressed", () => {
    render(<Segmented value="rule" options={MODES} onChange={() => {}} ariaLabel="代理模式" />);

    expect(screen.getByRole("button", { name: "规则" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "全局" })).toHaveAttribute("aria-pressed", "false");
  });

  it("reports the chosen value", async () => {
    const onChange = vi.fn();
    render(<Segmented value="rule" options={MODES} onChange={onChange} ariaLabel="代理模式" />);

    await userEvent.click(screen.getByRole("button", { name: "直连" }));

    expect(onChange).toHaveBeenCalledWith("direct");
  });
});
