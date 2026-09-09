import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

/**
 * The one button treatment for the staff and contractor admin surfaces.
 *
 * Neither surface had a `<Button>` before this — every call site wrote its
 * own Tailwind classes, which is how a page ends up with three different
 * blues for "primary". `buttonClasses` is exported so a `<Link>` that must
 * look like a button (routing, not submitting) can share the exact same
 * treatment as the real `<button>` below rather than a hand-copied twin
 * that drifts the next time this file changes.
 */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-electric text-white hover:bg-electric-hover disabled:hover:bg-electric",
  secondary: "border border-cardline bg-white text-navy hover:border-electric disabled:hover:border-cardline",
  ghost: "text-navy hover:bg-warmwhite disabled:hover:bg-transparent",
  danger: "border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:hover:bg-white",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-pill font-semibold transition",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-electric",
    "disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT[variant], SIZE[size], className,
  ].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary", size = "md", pending = false, pendingLabel, className = "",
  children, disabled, ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Swaps the label and disables the button — the same convention as the platform's existing SubmitButton, kept for one consistent "this is working" cue across both surfaces. */
  pending?: boolean;
  pendingLabel?: string;
}) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, size, className)}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      {...rest}
    >
      {pending ? (pendingLabel ?? children) : children}
    </button>
  );
}

/** Same visual treatment as `Button`, for navigation rather than an action. */
export function LinkButton({
  href, variant = "primary", size = "md", className = "", children, external = false,
}: {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={buttonClasses(variant, size, className)}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={buttonClasses(variant, size, className)}>
      {children}
    </Link>
  );
}
