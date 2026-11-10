import { Tag } from "@/components/base/tag";
import { MOCK_META } from "@/gateway/mock";
import type { Status } from "@/gateway/types";
import { formatUptime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

import { PAGES, type PageDefinition, type PageId } from "./pages";

export interface AppShellProps {
  page: PageDefinition;
  currentPage: PageId;
  status: Status | null;
  onNavigate: (pageId: PageId) => void;
  children?: ReactNode;
}

/**
 * Window chrome: 44px title bar (drag region, native traffic lights sit inside
 * it — we never draw our own), 240px sidebar, and the page container.
 *
 * The top strip starts at 80px so the macOS traffic lights keep their inset
 * position without colliding with the app name.
 */
export function AppShell({ page, currentPage, status, onNavigate, children }: AppShellProps) {
  return (
    <div className="flex h-dvh w-full flex-col bg-white text-ink">
      <header className="flex h-11 flex-none items-center gap-3 border-b-4 border-ink pl-20 pr-4">
        <span className="text-[15px] font-black tracking-[-0.2px]">GoClash</span>
        <span className="text-[11px] font-bold">
          {MOCK_META.appVersion} · mihomo {status?.coreVersion ?? MOCK_META.coreVersion}
        </span>
        <span className="ml-auto">
          {status?.systemProxy ? (
            <Tag tone="sunny" icon={<span aria-hidden className="size-2 bg-ink" />}>
              系统代理已接管
            </Tag>
          ) : null}
        </span>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-60 flex-none flex-col gap-3 border-r-4 border-ink p-5">
          <div className="flex items-center gap-3">
            <div
              aria-hidden
              className="flex size-12 flex-none items-center justify-center border-4 border-ink bg-coral text-[17px] font-black tracking-[-0.6px] text-white shadow-[4px_4px_0_var(--color-sunny)]"
            >
              GC
            </div>
            <div>
              <div className="text-xl font-black leading-[1.1] tracking-[-0.6px]">GoClash</div>
              <div className="mt-0.5 text-[11px] font-bold">Clash Meta 客户端</div>
            </div>
          </div>

          <nav aria-label="主导航" className="mt-3 flex flex-col gap-1.5">
            {PAGES.map((entry) => (
              <NavItem
                key={entry.id}
                label={entry.label}
                icon={entry.icon}
                active={entry.id === currentPage}
                onClick={() => onNavigate(entry.id)}
              />
            ))}
          </nav>

          <KernelCard status={status} />
        </aside>

        <main className="flex min-w-0 flex-1 flex-col gap-5 overflow-hidden p-7">
          <div className="flex h-16 flex-none items-start justify-between gap-4">
            <div>
              <h1 className="text-[34px] font-black leading-[1.12] tracking-[-1px]">
                {page.label}
              </h1>
              <div className="mt-0.5 text-xs font-bold">{page.sub}</div>
            </div>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-5">{children}</div>
        </main>
      </div>
    </div>
  );
}

interface NavItemProps {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}

function NavItem({ label, icon, active, onClick }: NavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-11 items-center gap-3 border-4 px-2.5 text-left text-[15px]",
        active
          ? "border-ink bg-coral font-black text-white shadow-[4px_4px_0_var(--color-mint)]"
          : "border-transparent font-bold text-ink hover:bg-sunny",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function KernelCard({ status }: { status: Status | null }) {
  const running = status !== null;
  return (
    <div className="mt-auto border-2 border-ink bg-white p-3 shadow-[4px_4px_0_var(--color-mint)]">
      <div className="flex items-center gap-2 text-xs font-bold">
        <i
          aria-hidden
          className={cn("size-2.5 border-2 border-ink", running ? "bg-mint" : "bg-white")}
        />
        {running ? "mihomo 运行中" : "内核未连接"}
      </div>
      <div className="mt-2 text-[10px] font-bold">
        {running
          ? `运行 ${formatUptime(status.uptimeSeconds)} · 混合端口 ${status.mixedPort}`
          : "等待内核应答"}
      </div>
    </div>
  );
}
