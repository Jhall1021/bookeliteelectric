/**
 * The one card wrapper for the staff and contractor admin surfaces — distinct
 * from the storefront theme Card. Admin cards stay Price2Book-owned regardless
 * of the contractor whose storefront is being configured.
 */
export function Card({
  children, className = "", padding = "md",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "none";
}) {
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5 sm:p-6";
  return (
    <div className={`rounded-card border border-line bg-surface shadow-card ${pad} ${className}`}>
      {children}
    </div>
  );
}

export function CardHeader({
  title, description, action,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-5">
      <div className="min-w-0">
        <h2 className="font-display text-[17px] font-extrabold tracking-[-0.025em] text-ink">{title}</h2>
        {description && <p className="mt-1.5 max-w-2xl text-[13px] leading-5 text-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
