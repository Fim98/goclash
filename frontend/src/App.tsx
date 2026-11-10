import { useCallback, useEffect, useMemo, useState } from "react";

import { createMockGateway } from "./gateway/mock";
import type { Gateway, Status } from "./gateway/types";
import { PagePlaceholder } from "./shell/page-placeholder";
import { PAGES, type PageId } from "./shell/pages";
import { StatusContext } from "./shell/status-context";
import { AppShell } from "./shell/shell";

/**
 * The single testing seam: pages receive a Gateway, and tests mount <App /> with
 * a controlled one. The mock is a module singleton so dev mode keeps its state
 * across page switches.
 */
const defaultGateway = createMockGateway();

export interface AppProps {
  gateway?: Gateway;
}

export default function App({ gateway = defaultGateway }: AppProps) {
  const [currentPage, setCurrentPage] = useState<PageId>("home");
  const [status, setStatus] = useState<Status | null>(null);
  const [statusError, setStatusError] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setStatus(await gateway.status());
      setStatusError(false);
    } catch {
      setStatusError(true);
    }
  }, [gateway]);

  // Mount fetch, in callback form: the lint rules forbid calling a
  // setState-containing function directly inside an effect body, so event
  // handlers use refresh() while the effect wires the same contract itself.
  useEffect(() => {
    let cancelled = false;
    gateway
      .status()
      .then((next) => {
        if (cancelled) return;
        setStatus(next);
        setStatusError(false);
      })
      .catch(() => {
        if (cancelled) return;
        setStatusError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  const statusContext = useMemo(
    () => ({ status, error: statusError, setStatus, refresh }),
    [status, statusError, setStatus, refresh],
  );

  const page = PAGES.find((candidate) => candidate.id === currentPage) ?? PAGES[0];
  const actions = page.actions?.(gateway, setCurrentPage);

  return (
    <StatusContext.Provider value={statusContext}>
      <AppShell
        page={page}
        status={status}
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        actions={actions}
      >
        {page.render ? (
          page.render(gateway, setCurrentPage)
        ) : (
          <PagePlaceholder label={page.label} />
        )}
      </AppShell>
    </StatusContext.Provider>
  );
}
