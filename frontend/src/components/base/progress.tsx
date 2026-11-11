import { cn } from "@/lib/utils";

/**
 * Brutalist progress bar: a 2px outlined track with a hard-filled bar. No
 * rounding, no gradient — the fill is one of the candy accents and the track is
 * the surface colour, so it reads at a glance in both themes.
 */
export interface ProgressProps {
  /** 0–1. Values outside the range are clamped. */
  value: number;
  /** Accessible name; the bar is otherwise decorative. */
  label: string;
  className?: string;
}

export function Progress({ value, label, className }: ProgressProps) {
  const ratio = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
  const percent = Math.round(ratio * 100);
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className={cn("h-3 w-full border-2 border-ink bg-surface", className)}
    >
      <div
        aria-hidden
        className="h-full bg-mint transition-[width] duration-200 ease-linear"
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
