import { cn } from "@/lib/utils";

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /**
   * sm (46×26) sits in rows and toolbars; xl (132×66) is the hero control on
   * the home screen.
   */
  size?: "sm" | "xl";
  /** Accessible name; required because the control renders no visible label. */
  label: string;
  className?: string;
}

/**
 * Square toggle. Mint = on, paper = off, knob is always a solid block.
 *
 * The knob moves by flex justification (justify-start/end) rather than
 * translate, so `prefers-reduced-motion` can neutralise transforms without
 * breaking the control.
 */
export function Switch({ checked, onCheckedChange, size = "sm", label, className }: SwitchProps) {
  const isLarge = size === "xl";
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex cursor-pointer items-center border-4 border-ink transition-colors",
        isLarge ? "h-[66px] w-[132px] gap-0 p-[5px]" : "h-[26px] w-[46px] gap-0 p-[3px]",
        checked ? "justify-end bg-mint" : "justify-start bg-white",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn("block", isLarge ? "size-12 border-4 border-ink bg-white" : "size-4 bg-ink")}
      />
    </button>
  );
}
