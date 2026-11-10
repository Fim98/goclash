import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Brutalist buttons.
 *
 * Motion contract (design.md): everything springs on
 * cubic-bezier(0.34, 1.56, 0.64, 1) over 300ms; pressing displaces by the
 * shadow offset and drops the shadow. The spring curve lives in the base
 * classes; variants own their resting rotation and shadow colour.
 *
 * Only primary tilts at rest (-2°) — decorative rotation never lands on dense
 * controls (tables, switches, inputs).
 */
export type ButtonVariant = "primary" | "ghost" | "ink";

const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "border-ink bg-coral text-white -rotate-2 shadow-[5px_5px_0_var(--color-mint)] hover:rotate-3 hover:-translate-y-1 hover:shadow-[8px_8px_0_var(--color-sunny)] active:translate-x-[6px] active:translate-y-[6px] active:rotate-0 active:scale-95",
  ghost:
    "border-ink bg-white text-ink shadow-[4px_4px_0_var(--color-sunny)] hover:rotate-2 hover:-translate-y-[3px] active:translate-x-[6px] active:translate-y-[6px]",
  ink: "border-ink bg-ink text-white shadow-[6px_6px_0_var(--color-sunny)] hover:-translate-y-1 active:translate-x-[6px] active:translate-y-[6px]",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Leading icon, sized by the caller. */
  icon?: ReactNode;
}

export function Button({
  variant = "primary",
  icon,
  className,
  children,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex h-11 cursor-pointer items-center justify-center gap-2 border-4 px-5 text-sm font-black",
        "transition-[translate,rotate,scale,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] active:shadow-none",
        VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </button>
  );
}

export type IconButtonSize = "xs" | "sm" | "md";

const ICON_SIZES: Record<IconButtonSize, string> = {
  // Small squares sit inside dense rows: 2px border, no shadow.
  xs: "size-[26px] border-2",
  sm: "size-9 border-2",
  md: "size-11 border-4 shadow-[4px_4px_0_var(--color-mint)]",
};

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  size?: IconButtonSize;
}

export function IconButton({
  size = "md",
  className,
  children,
  type = "button",
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex cursor-pointer items-center justify-center border-ink bg-white text-ink",
        "transition-[translate,rotate] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] hover:-translate-y-0.5 hover:rotate-2",
        ICON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
