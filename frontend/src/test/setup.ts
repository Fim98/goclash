import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

// Testing Library only auto-cleans up when globals are enabled; this project
// imports describe/it/expect from vitest explicitly, so cleanup is manual.
afterEach(() => {
  cleanup();
  // The language choice is cached in localStorage for a flash-free first paint;
  // without this a test that switches to English leaks into every later test.
  window.localStorage.clear();
});
