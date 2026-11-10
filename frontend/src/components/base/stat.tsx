import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, type CardShadow } from "./card";

export interface StatCardProps {
  /** Small caption above the value; carries the unit, e.g. "下载速度 · MB/s". */
  label: string;
  /** Rendered at 32px black — numbers only, the unit stays in the label. */
  value: string;
  icon: ReactNode;
  /** Square behind the icon; defaults to sunny so all three stats differ. */
  iconBackground?: string;
  shadow?: CardShadow;
  className?: string;
}

export function StatCard({
  label,
  value,
  icon,
  iconBackground = "var(--color-sunny)",
  shadow = "coral",
  className,
}: StatCardProps) {
  return (
    <Card
      shadow={shadow}
      shadowSize={6}
      className={cn("flex items-center justify-between px-5 py-4", className)}
    >
      <div className="min-w-0">
        <div className="text-[11px] font-black leading-none">{label}</div>
        <div className="mt-1.5 font-black leading-[1.15] tracking-[-1px] tabular-nums text-[32px]">
          {value}
        </div>
      </div>
      <div
        aria-hidden
        className="flex size-9 flex-none items-center justify-center border-2 border-ink [&>svg]:size-[18px]"
        style={{ background: iconBackground }}
      >
        {icon}
      </div>
    </Card>
  );
}
