import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { Switch } from "./switch";

describe("Switch", () => {
  it("exposes state through role and aria-checked", () => {
    render(<Switch checked={false} onCheckedChange={() => {}} label="系统代理" />);

    const control = screen.getByRole("switch", { name: "系统代理" });
    expect(control).toHaveAttribute("aria-checked", "false");
  });

  it("toggles on click and reports the next value", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={false} onCheckedChange={onCheckedChange} label="系统代理" />);

    await userEvent.click(screen.getByRole("switch"));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it("toggles with the keyboard (Space)", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch checked={true} onCheckedChange={onCheckedChange} label="系统代理" />);

    const control = screen.getByRole("switch");
    await userEvent.tab();
    await userEvent.keyboard(" ");

    expect(control).toHaveFocus();
    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it("keeps the knob square in both sizes", () => {
    const { rerender } = render(
      <Switch checked={true} onCheckedChange={() => {}} label="系统代理" size="sm" />,
    );
    const small = screen.getByRole("switch").firstElementChild as HTMLElement;
    expect(small.className).toContain("size-4");

    rerender(<Switch checked={true} onCheckedChange={() => {}} label="系统代理" size="xl" />);
    const large = screen.getByRole("switch").firstElementChild as HTMLElement;
    expect(large.className).toContain("size-12");
  });
});
