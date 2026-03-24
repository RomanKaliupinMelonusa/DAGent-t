// =============================================================================
// UI Primitives — Shared Button and Input components
// =============================================================================

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes } from "react";

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

const buttonBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors focus:ring-2 focus:ring-ring focus:outline-none disabled:cursor-not-allowed disabled:opacity-50";

const buttonVariants = {
  primary:
    "bg-primary text-primary-text hover:bg-primary-hover",
  secondary:
    "border border-border bg-surface-alt text-text-secondary hover:bg-surface-hover",
  danger:
    "border border-danger-border bg-danger-bg text-danger-text hover:bg-danger-bg/80",
  ghost:
    "text-text-muted hover:bg-surface-hover hover:text-text-secondary",
} as const;

const buttonSizes = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
} as const;

type ButtonVariant = keyof typeof buttonVariants;
type ButtonSize = keyof typeof buttonSizes;

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`${buttonBase} ${buttonVariants[variant]} ${buttonSizes[size]} ${className}`}
      {...props}
    />
  ),
);
Button.displayName = "Button";

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-border-input bg-surface-alt px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 transition-colors ${className}`}
      {...props}
    />
  ),
);
Input.displayName = "Input";

