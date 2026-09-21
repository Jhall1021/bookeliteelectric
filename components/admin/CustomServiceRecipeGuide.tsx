import Link from "next/link";
import type { CustomServiceRecipeReadiness, RecipeStageStatus } from "@/lib/customServiceRecipeReadiness";

type DisplayStatus = RecipeStageStatus | "OPTIONAL";

const STATUS_COPY: Record<DisplayStatus, { label: string; className: string }> = {
  COMPLETE: { label: "Complete", className: "bg-success/10 text-success" },
  NEEDS_INPUT: { label: "Needs a decision", className: "bg-amber-50 text-amber-800" },
  BLOCKED: { label: "Incomplete", className: "bg-red-50 text-red-700" },
  OPTIONAL: { label: "Review", className: "bg-electric/10 text-electric" },
};

function Stage({
  number,
  title,
  description,
  status,
  href,
  action,
}: {
  number: number;
  title: string;
  description: string;
  status: DisplayStatus;
  href: string;
  action: string;
}) {
  const badge = STATUS_COPY[status];
  return (
    <li className="flex flex-col gap-3 rounded-card border border-cardline p-4 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">
          {number}
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-navy">{title}</h3>
            <span className={`rounded-pill px-2 py-1 text-[11px] font-semibold ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <p className="mt-1 text-sm leading-5 text-slate">{description}</p>
        </div>
      </div>
      <Link
        href={href}
        className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy hover:border-electric hover:text-electric"
      >
        {action}
      </Link>
    </li>
  );
}

export default function CustomServiceRecipeGuide({
  serviceId,
  readiness,
}: {
  serviceId: string;
  readiness: CustomServiceRecipeReadiness;
}) {
  const tab = (name: string) => `/dashboard/services/${serviceId}?tab=${name}`;

  return (
    <section className="max-w-3xl rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">Build this service recipe</h2>
      <p className="mt-2 text-sm leading-6 text-slate">
        A recipe combines the work time, materials and customer scope needed for one service.
        Price2Book calculates a suggestion from those approved inputs; it never publishes the
        result until you approve it.
      </p>

      <ol className="mt-5 space-y-3">
        <Stage
          number={1}
          title="Labor and duration"
          description="Record the approved crew-hours and separately review the scheduling duration. Missing labor never becomes zero."
          status={readiness.labor === "COMPLETE" ? readiness.duration : readiness.labor}
          href={tab("pricing")}
          action="Set labor"
        />
        <Stage
          number={2}
          title="Materials"
          description="Add the parts and quantities this service consumes, or explicitly record a zero allowance for a genuinely labor-only service."
          status={readiness.materials}
          href={tab("materials")}
          action="Build materials"
        />
        <Stage
          number={3}
          title="Customer scope"
          description="Add questions only when an answer changes eligibility, scope or routing. Technical uncertainty should route to review, not ask the homeowner to diagnose it."
          status="OPTIONAL"
          href={tab("questions")}
          action="Review questions"
        />
        <Stage
          number={4}
          title="Calculated price"
          description="Review the price calculated from labor, materials and company pricing rules, then explicitly approve it."
          status={readiness.price}
          href={tab("pricing")}
          action="Review price"
        />
      </ol>

      <div className={`mt-5 rounded-card p-4 text-sm ${
        readiness.readyToPublish ? "bg-success/10 text-success" : "bg-warmwhite text-slate"
      }`}>
        {readiness.readyToPublish
          ? "The numeric recipe is complete and a customer price has been approved. Storefront activation remains a separate decision with its normal safety checks."
          : "This service stays hidden while required recipe inputs or price approval are missing."}
      </div>

      <p className="mt-4 text-xs leading-5 text-slate">
        Atomic labor-operation selection is intentionally not editable here yet. Until custom
        recipe storage has the same tenant and approval guarantees as the canonical catalog,
        this guide uses the existing approved labor total instead of pretending an unsaved list
        of operations is authoritative.
      </p>
    </section>
  );
}
