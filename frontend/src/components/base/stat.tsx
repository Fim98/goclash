import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card, type CardShadow } from "./card";

export interface StatCardProps {
  /** Small caption above the value; carries the unit when it is fixed, e.g. "下载速度". */
  label: string;
  /** Rendered at 32px black — usually a string, but a skeleton bar while streaming. */
  value: ReactNode;
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
