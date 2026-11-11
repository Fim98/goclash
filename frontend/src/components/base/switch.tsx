import { cn } from "@/lib/utils";

export type SwitchSize = "sm" | "md" | "xl";

const SIZES: Record<SwitchSize, { box: string; knob: string }> = {
  // rows and toolbars
  // The knob colour comes from the track, not the page: black on the light
  // tracks, ink on the dark one (see the span below).
  sm: { box: "h-[26px] w-[46px] p-[3px]", knob: "size-4" },
  // the tray popup's hero switch
  md: { box: "h-[34px] w-[64px] p-[4px]", knob: "size-[22px]" },
  // the home hero
  xl: { box: "h-[66px] w-[132px] p-[5px]", knob: "size-12 border-4 border-ink" },
};

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  size?: SwitchSize;
  /** Accessible name; required because the control renders no visible label. */
  label: string;
  /** Blocks the control, e.g. TUN on a platform without the daemon. */
  disabled?: boolean;
  className?: string;
}

/**
 * Square toggle. Mint = on, paper = off, knob is always a solid block.
 *
 * The knob moves by flex justification (justify-start/end) rather than
 * translate, so `prefers-reduced-motion` can neutralise transforms without
 * breaking the control.
 */
export function Switch({
  checked,
  onCheckedChange,
  size = "sm",
  label,
  disabled = false,
  className,
}: SwitchProps) {
  const sizing = SIZES[size];
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex cursor-pointer items-center gap-0 border-4 border-ink transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        sizing.box,
        checked ? "justify-end bg-mint" : "justify-start bg-surface",
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "block",
          sizing.knob,
          // The hero switch keeps its white knob (it sits on coral); the small
          // ones follow the track: black on mint, ink on the dark track.
          size === "xl" ? "bg-white" : checked ? "bg-on-accent" : "bg-ink",
        )}
      />
    </button>
  );
}
