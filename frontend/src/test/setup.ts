import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

import "@testing-library/jest-dom/vitest";

// Testing Library only auto-cleans up when globals are enabled; this project
// imports describe/it/expect from vitest explicitly, so cleanup is manual.
afterEach(() => {
  cleanup();
});
