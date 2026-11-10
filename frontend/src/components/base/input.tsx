import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Leading icon, sized by the caller. */
  icon?: ReactNode;
  /** Error state: border and shadow both turn coral. */
  invalid?: boolean;
  className?: string;
}

/**
 * Square text field. Focus grows a 4px mint shadow *without* changing size —
 * the box never moves, which is what keeps dense toolbars from jittering.
 */
export function Input({ icon, invalid = false, className, ...props }: InputProps) {
  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 border-4 bg-white px-3",
        invalid
          ? "border-coral shadow-[4px_4px_0_var(--color-coral)]"
          : "border-ink shadow-[4px_4px_0_var(--color-seafoam)] focus-within:shadow-[4px_4px_0_var(--color-mint)]",
        className,
      )}
    >
      {icon}
      <input
        className="w-full bg-transparent text-xs font-bold text-ink outline-none placeholder:text-ink"
        {...props}
      />
    </div>
  );
}
