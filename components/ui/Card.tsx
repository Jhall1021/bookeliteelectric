/**
 * The one card wrapper for the staff and contractor admin surfaces —
 * distinct from components/theme/Card.tsx, which carries a CONTRACTOR's
 * storefront theme (raised vs. bordered, per their own design choice). This
 * one is fixed: white on warm-white, a hairline border, the platform's own
 * shadow. Every admin panel should look the same regardless of whose
 * storefront it's configuring.
 */
export function Card({
  children, className = "", padding = "md",
}: {
  children: React.ReactNode;
  className?: string;
  padding?: "sm" | "md" | "none";
}) {
  const pad = padding === "none" ? "" : padding === "sm" ? "p-4" : "p-5";
  return (
    <div className={`rounded-card border border-cardline bg-white shadow-card ${pad} ${className}`}>
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
    <div className="flex items-start justify-between gap-4">
      <div>
        <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
        {description && <p className="mt-1 text-sm text-slate">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
