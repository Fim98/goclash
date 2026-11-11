import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Cards are the only elevated surface. Hard shadows never blur and never take
 * part in layout — they are pure box-shadow, so rows can sit 20px apart while
 * an 8px shadow reaches into the gutter.
 *
 * The shadows are a static map on purpose: Tailwind only generates classes it
 * can see as literals in the source, so these must never be composed at runtime.
 */
export type CardShadow = "mint" | "coral" | "sunny" | "seafoam" | "peach" | "ink";
export type CardShadowSize = 4 | 6 | 8 | 12;

const SHADOWS: Record<CardShadow, Record<CardShadowSize, string>> = {
  mint: {
    4: "shadow-[4px_4px_0_var(--color-mint)]",
    6: "shadow-[6px_6px_0_var(--color-mint)]",
    8: "shadow-[8px_8px_0_var(--color-mint)]",
    12: "shadow-[12px_12px_0_var(--color-mint)]",
  },
  coral: {
    4: "shadow-[4px_4px_0_var(--color-coral)]",
    6: "shadow-[6px_6px_0_var(--color-coral)]",
    8: "shadow-[8px_8px_0_var(--color-coral)]",
    12: "shadow-[12px_12px_0_var(--color-coral)]",
  },
  sunny: {
    4: "shadow-[4px_4px_0_var(--color-sunny)]",
    6: "shadow-[6px_6px_0_var(--color-sunny)]",
    8: "shadow-[8px_8px_0_var(--color-sunny)]",
    12: "shadow-[12px_12px_0_var(--color-sunny)]",
  },
  seafoam: {
    4: "shadow-[4px_4px_0_var(--color-seafoam)]",
    6: "shadow-[6px_6px_0_var(--color-seafoam)]",
    8: "shadow-[8px_8px_0_var(--color-seafoam)]",
    12: "shadow-[12px_12px_0_var(--color-seafoam)]",
  },
  peach: {
    4: "shadow-[4px_4px_0_var(--color-peach)]",
    6: "shadow-[6px_6px_0_var(--color-peach)]",
    8: "shadow-[8px_8px_0_var(--color-peach)]",
    12: "shadow-[12px_12px_0_var(--color-peach)]",
  },
  ink: {
    4: "shadow-[4px_4px_0_var(--color-ink)]",
    6: "shadow-[6px_6px_0_var(--color-ink)]",
    8: "shadow-[8px_8px_0_var(--color-ink)]",
    12: "shadow-[12px_12px_0_var(--color-ink)]",
  },
};

export interface CardProps {
  shadow?: CardShadow;
  /** 6px for dense rows, 8px for page cards, 12px for floating windows. */
  shadowSize?: CardShadowSize;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

export function Card({ shadow = "mint", shadowSize = 8, className, style, children }: CardProps) {
  return (
    <div
      className={cn(
        "relative border-4 border-ink bg-surface",
        SHADOWS[shadow][shadowSize],
        className,
      )}
      style={style}
    >
      {children}
    </div>
  );
}
