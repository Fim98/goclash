import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface SegmentedProps<T extends string> {
  value: T;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  onChange: (value: T) => void;
  /** Accessible name for the group, e.g. "代理模式". */
  ariaLabel?: string;
  className?: string;
}

/**
 * Exclusively-one-choice control (规则/全局/直连). The container carries the
 * 4px ink border; the selected option is filled coral. Radix was skipped here
 * on purpose — a pressed-state group is enough and keeps the DOM flat.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  className,
}: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn("inline-flex border-4 border-ink", className)}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-10 cursor-pointer px-5 text-[13px] font-bold text-ink",
              selected && "bg-coral font-black text-white",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
