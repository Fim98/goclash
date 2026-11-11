import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Short labels. They must never wrap and never shrink inside a flex row —
 * the brutalist tags are square-ish blocks, and a wrapped tag turns into a
 * column of single characters.
 */
export type TagTone = "white" | "ink" | "coral" | "mint" | "sunny" | "seafoam" | "peach";

const TONES: Record<TagTone, string> = {
  white: "bg-surface text-ink",
  ink: "bg-ink text-surface",
  coral: "bg-coral text-white",
  mint: "bg-mint text-on-accent",
  sunny: "bg-sunny text-on-accent",
  seafoam: "bg-seafoam text-on-accent",
  peach: "bg-peach text-on-accent",
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
 * Pass onClick to make it an interactive filter (renders a button).
 */
export interface ChipProps {
  active?: boolean;
  onClick?: () => void;
  className?: string;
  children?: ReactNode;
}

export function Chip({ active = false, onClick, className, children }: ChipProps) {
  const base = cn(
    "inline-flex h-[34px] flex-none items-center whitespace-nowrap border-2 border-ink px-3.5 text-xs font-bold",
    active ? "bg-ink text-surface" : "bg-surface text-ink",
    onClick &&
      "cursor-pointer transition-transform duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5",
    className,
  );

  if (onClick) {
    return (
      <button type="button" aria-pressed={active} onClick={onClick} className={base}>
        {children}
      </button>
    );
  }

  return <span className={base}>{children}</span>;
}
