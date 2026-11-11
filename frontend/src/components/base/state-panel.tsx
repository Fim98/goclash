import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type PanelState = "loading" | "error" | "empty" | "ready";

export interface PanelCopy {
  title?: string;
  description?: ReactNode;
  icon?: ReactNode;
  /** Single primary action — empty states. */
  action?: ReactNode;
  /** One or two actions — error states. */
  actions?: ReactNode;
}

export interface AsyncPanelProps {
  state: PanelState;
  error?: PanelCopy;
  empty?: PanelCopy;
  /** Rendered only when state is "ready". */
  children?: ReactNode;
  className?: string;
}

const SKELETON_WIDTHS = ["w-[300px]", "w-[210px]", "w-[255px]"];

function Skeleton() {
  return (
    <div className="flex flex-col items-center gap-2.5">
      {SKELETON_WIDTHS.map((width) => (
        <div key={width} aria-hidden className={cn("h-3.5 border-2 border-ink", width)} />
      ))}
    </div>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-7 py-7 text-center">
      {children}
    </div>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <h3 className="text-[22px] font-black leading-tight tracking-[-0.6px]">{children}</h3>;
}

function Description({ children }: { children: ReactNode }) {
  return <p className="max-w-[470px] text-[11px] font-bold leading-[18px]">{children}</p>;
}

function IconBox({ children, tone }: { children: ReactNode; tone: string }) {
  return (
    <div
      aria-hidden
      className="flex size-14 items-center justify-center border-4 border-ink [&>svg]:size-[26px]"
      style={{ background: tone }}
    >
      {children}
    </div>
  );
}

/**
 * Every data surface renders through this wrapper, so no page can ship a bare
 * white screen: loading = outlined skeleton (no grey blocks), error = copy plus
 * recovery actions, empty = icon plus title plus the primary action.
 */
export function AsyncPanel({ state, error, empty, children, className }: AsyncPanelProps) {
  if (state === "loading") {
    return (
      <div className={cn("flex flex-1 flex-col border-4 border-ink bg-surface", className)}>
        <Centered>
          <Skeleton />
        </Centered>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col border-4 border-ink bg-surface shadow-[8px_8px_0_var(--color-coral)]",
          className,
        )}
      >
        <Centered>
          <IconBox tone="var(--color-coral)">{error?.icon}</IconBox>
          <Title>{error?.title ?? "出错了"}</Title>
          <Description>{error?.description}</Description>
          {error?.actions ? <div className="mt-1 flex gap-2.5">{error.actions}</div> : null}
        </Centered>
      </div>
    );
  }

  if (state === "empty") {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col border-4 border-ink bg-surface shadow-[8px_8px_0_var(--color-mint)]",
          className,
        )}
      >
        <Centered>
          <IconBox tone="var(--color-white)">{empty?.icon}</IconBox>
          <Title>{empty?.title ?? "暂无内容"}</Title>
          <Description>{empty?.description}</Description>
          {empty?.action ? <div className="mt-1">{empty.action}</div> : null}
        </Centered>
      </div>
    );
  }

  return <div className={cn("flex min-h-0 flex-1 flex-col", className)}>{children}</div>;
}
