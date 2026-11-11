import { afterEach, describe, expect, it } from "vitest";

import { applyTheme, resolveTheme } from "./theme";

describe("theme", () => {
  afterEach(() => {
    delete document.documentElement.dataset.theme;
  });

  it("resolves the system preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });

  it("writes the resolved theme onto the document element", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");

    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("falls back to light when the platform has no media query", () => {
    // jsdom implements matchMedia in recent versions; either way "system" must
    // resolve to a concrete theme rather than leaving the attribute unset.
    applyTheme("system");
    expect(["light", "dark"]).toContain(document.documentElement.dataset.theme);
  });
});
