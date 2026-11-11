/**
 * Theme is a structural flip: the shell only swaps --ink / --surface (see
 * index.css), so every component follows without dark: variants.
 *
 * "system" keeps a live listener, so changing the OS appearance updates the
 * window without a reload or a trip through settings.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

let chosen: Theme = "light";
let query: MediaQueryList | null = null;

/** Pure decision, exported so the resolution is testable without the DOM. */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  if (theme === "system") return prefersDark ? "dark" : "light";
  return theme;
}

function paint() {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolveTheme(chosen, query?.matches ?? false);
}

/**
 * Applies a theme and remembers it. Calling it with "system" installs the
 * media-query listener once; later calls only repaint.
 */
export function applyTheme(theme: Theme) {
  chosen = theme;
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    if (!query) {
      query = window.matchMedia("(prefers-color-scheme: dark)");
      query.addEventListener("change", () => {
        if (chosen === "system") paint();
      });
    }
  }
  paint();
}

/** What the user picked, not what is on screen. */
export function currentTheme(): Theme {
  return chosen;
}
