import Link from "next/link";
import type { ButtonHTMLAttributes } from "react";

/** One button language for both Price2Book admin surfaces. */
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-accent text-white shadow-sm hover:bg-accent-hover disabled:hover:bg-accent",
  secondary: "border border-line bg-white text-ink shadow-sm hover:border-accent/35 hover:bg-canvas disabled:hover:border-line",
  ghost: "text-ink-soft hover:bg-canvas hover:text-ink disabled:hover:bg-transparent",
  danger: "border border-red-200 bg-white text-red-700 shadow-sm hover:bg-red-50 disabled:hover:bg-white",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "min-h-8 px-3 py-1.5 text-[12px]",
  md: "min-h-10 px-4 py-2 text-[13px]",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", className = ""): string {
  return [
    "inline-flex items-center justify-center gap-2 rounded-[10px] font-bold tracking-[-0.01em] transition-all duration-150",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
