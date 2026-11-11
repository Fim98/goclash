import { useCallback, useEffect, useMemo, useState } from "react";

import { createMockGateway } from "./gateway/mock";
import type { Gateway, Status } from "./gateway/types";
import {
  LocaleProvider,
  localeFromSetting,
  readStoredLocale,
  storeLocale,
  type Locale,
} from "./lib/i18n";
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
  // Cached value first (paints in the right language), settings file second.
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    storeLocale(next);
  }, []);

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

  // The language lives in settings.json; the window only mirrors it. A failed
  // read keeps whatever the cache said rather than snapping back to Chinese.
  useEffect(() => {
    let cancelled = false;
    gateway
      .settings()
      .then((next) => {
        if (cancelled) return;
        setLocale(localeFromSetting(next.language));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [gateway, setLocale]);

  // Screen readers and the font stack both read this.
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const statusContext = useMemo(
    () => ({ status, error: statusError, setStatus, refresh }),
    [status, statusError, setStatus, refresh],
  );

  const page = PAGES.find((candidate) => candidate.id === currentPage) ?? PAGES[0];

  return (
    <LocaleProvider locale={locale} setLocale={setLocale}>
      <StatusContext.Provider value={statusContext}>
        <AppShell page={page} status={status} currentPage={currentPage} onNavigate={setCurrentPage}>
          {page.render ? (
            page.render(gateway, setCurrentPage)
          ) : (
            <PagePlaceholder label={page.label} />
          )}
        </AppShell>
      </StatusContext.Provider>
    </LocaleProvider>
  );
}
