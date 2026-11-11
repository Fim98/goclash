import { createContext } from "react";

/**
 * DOM slot in the page header. Pages portal their header buttons into it so the
 * buttons stay at the top right (as the boards show) while the state behind them
 * stays inside the page component.
 */
export const HeaderActionsContext = createContext<HTMLElement | null>(null);
