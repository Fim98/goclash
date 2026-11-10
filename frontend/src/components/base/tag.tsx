import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Short labels. They must never wrap and never shrink inside a flex row —
 * the brutalist tags are square-ish blocks, and a wrapped tag turns into a
 * column of single characters.
 */
export type TagTone = "white" | "ink" | "coral" | "mint" | "sunny" | "seafoam" | "peach";

const TONES: Record<TagTone, string> = {
  white: "bg-white text-ink",
  ink: "bg-ink text-white",
  coral: "bg-coral text-white",
  mint: "bg-mint text-ink",
  sunny: "bg-sunny text-ink",
  seafoam: "bg-seafoam text-ink",
  peach: "bg-peach text-ink",
};

export interface TagProps {
  tone?: TagTone;
  /** Leading status square (mint) — used by the "已连接" state tag. */
  dot?: boolean;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}

export function Tag({ tone = "white", dot = false, icon, className, children }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex flex-none items-center gap-1.5 whitespace-nowrap border-2 border-ink px-2.5 py-1 text-[11px] font-bold leading-none",
        TONES[tone],
        className,
      )}
    >
      {dot ? <span aria-hidden className="size-2 border-2 border-ink bg-mint" /> : null}
      {icon}
      {children}
    </span>
  );
}

/**
 * Filter chips: the taller sibling of Tag used in toolbars. The active chip is
 * inverted (ink on paper) — colour stays reserved for state, not decoration.
 */
export interface ChipProps {
  active?: boolean;
  className?: string;
  children?: ReactNode;
}

export function Chip({ active = false, className, children }: ChipProps) {
  return (
    <span
      className={cn(
        "inline-flex h-[34px] flex-none items-center whitespace-nowrap border-2 border-ink px-3.5 text-xs font-bold",
        active ? "bg-ink text-white" : "bg-white text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}
