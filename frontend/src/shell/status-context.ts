import { createContext, useContext } from "react";

import type { Status } from "@/gateway/types";

/**
 * App-owned kernel status. The shell (sidebar kernel card, title-bar hint) and
 * the pages (hero, mode switching, IP card) read the same snapshot, so a toggle
 * anywhere updates everywhere without prop drilling through the page registry.
 */
export interface StatusContextValue {
  status: Status | null;
  /** True when the last status() attempt failed — pages render recovery UI. */
  error: boolean;
  /** Optimistic patch; the next refresh() confirms or overrides it. */
  setStatus: (status: Status) => void;
  refresh: () => Promise<void>;
}

export const StatusContext = createContext<StatusContextValue | null>(null);

export function useAppStatus(): StatusContextValue {
  const value = useContext(StatusContext);
  if (!value) throw new Error("useAppStatus must be used inside <App>");
  return value;
}
