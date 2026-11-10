import { useEffect, useState } from "react";

import { createMockGateway } from "./gateway/mock";
import type { Gateway, Status } from "./gateway/types";
import { AppShell } from "./shell/shell";
import { PagePlaceholder } from "./shell/page-placeholder";
import { PAGES, type PageId } from "./shell/pages";

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

  useEffect(() => {
    let cancelled = false;
    gateway
      .status()
      .then((next) => {
        if (!cancelled) setStatus(next);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gateway]);

  const page = PAGES.find((candidate) => candidate.id === currentPage) ?? PAGES[0];

  return (
    <AppShell page={page} status={status} currentPage={currentPage} onNavigate={setCurrentPage}>
      {page.render ? page.render(gateway) : <PagePlaceholder label={page.label} />}
    </AppShell>
  );
}
