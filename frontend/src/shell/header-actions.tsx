import { useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { HeaderActionsContext } from "./header-actions-context";

/**
 * Renders its children into the page header's action slot. Pages keep ownership
 * of the state behind their buttons (filters, clearing a buffer) while the
 * buttons themselves sit where the boards put them.
 */
export function HeaderActions({ children }: { children: ReactNode }) {
  const target = useContext(HeaderActionsContext);
  return target ? createPortal(children, target) : null;
}
