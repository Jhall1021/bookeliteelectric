/**
 * A short status label — the platform never had one; status was plain text
 * or ad hoc pill classes repeated per call site.
 *
 * NEUTRAL IS A REAL OPTION, DELIBERATELY. A contractor mid-setup, or a
 * catalog stage nobody has touched yet, is the ordinary, unremarkable state
 * most contractors are in most of the time — it is not a problem, so it
 * does not get amber or red. Only a genuine blocker or something that
 * actually needs a person's attention earns a warm color; "in setup" reads
 * as calm, informational blue-gray, the same way "not started" does.
 */
export type BadgeTone = "success" | "attention" | "blocker" | "neutral" | "info";

const TONE: Record<BadgeTone, string> = {
  success: "bg-success/10 text-success",
  attention: "bg-p2b-amber-tint text-p2b-amber-ink",
  blocker: "bg-red-50 text-red-700",
  neutral: "bg-slate/10 text-slate",
  info: "bg-electric/10 text-electric",
};

export function Badge({ tone = "neutral", children, className = "" }: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`inline-flex items-center rounded-pill px-2 py-0.5 text-xs font-medium ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}
