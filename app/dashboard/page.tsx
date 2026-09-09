import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { findDefinition } from "@/lib/theme/definition";
import { assessOnboarding } from "@/lib/onboardingReadiness";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ChecklistIcon, CheckCircleIcon, ClockIcon, ArrowRightIcon, CalendarIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

/**
 * The contractor control panel.
 *
 * Its organising idea is the handoff's headline, and the page states it rather
 * than implying it:
 *
 *   "Everything your customer sees traces back to something you control."
 *
 * Built around the next useful action rather than a wall of equal tiles, and
 * not a CRM: there is no Customers card, no Invoices card and no Reports
 * card, because those belong to the software the contractor already runs
 * and Price2Book does not replace it.
 *
 * The counts are real reads, not decoration. A dashboard whose numbers are
 * placeholder is worse than one with none: it teaches the contractor not to
 * trust the screen.
 */
export default async function PortalOverviewPage() {
  const data = await withAdminContractor(async (db, ctx) => {
    const QUOTE_ONLY = { bookingType: "REMOTE_QUOTE" as const };
    const [priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, bookingsTotal] = await Promise.all([
      db.service.count({ where: { active: true, publishedPriceApprovedAt: { not: null } } }),
      db.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      db.service.count({ where: { active: true, publishedPriceApprovedAt: null, NOT: QUOTE_ONLY } }),
      db.service.count({ where: { active: false } }),
      // Both pre-price states count as "waiting on you": a homeowner cannot
      // tell the difference between submitted and in review, and neither can act.
      db.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      db.contractor.findUniqueOrThrow({
        where: { id: ctx.contractorId },
        select: { name: true, themeFamily: true, themeVariant: true, themeVersion: true,
                  pricingStrategy: true, sites: { where: { active: true }, select: { hostedSlug: true }, take: 1 } },
      }),
      db.contractorOnboarding.findUnique({ where: { contractorId: ctx.contractorId }, select: { completedAt: true, currentStage: true } }),
      assessOnboarding(db, ctx.contractorId),
      db.service.findMany({ where: { offered: true }, select: { id: true, name: true, templateKey: true }, orderBy: { name: "asc" }, take: 8 }),
      db.booking.count(),
    ]);
    return { priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, bookingsTotal, userId: ctx.userId };
  });

  // Person, not business — "Welcome back, Joshua" reads for the human at the
  // keyboard. User is cross-tenant identity, read the same way
  // resolveAdminContractor() itself reads it: bare, by primary key.
  const person = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
  const firstName = person?.name?.trim().split(/\s+/)[0] || null;

  const design = findDefinition(
    data.themeRow.themeFamily, data.themeRow.themeVariant, data.themeRow.themeVersion);
  const site = data.themeRow.sites[0]?.hostedSlug ?? null;
  const total = data.priced + data.quoteOnly + data.needsPrice + data.hidden;
  const liveServices = data.priced + data.quoteOnly;
  const launched = site !== null && liveServices > 0;

  // Setup is unfinished exactly when there's no completion timestamp — never
  // inferred from readiness alone, since a launched contractor can still
  // pick up new warnings without that meaning "go back through setup".
  const setupUnfinished = data.onboarding?.completedAt == null;
  const resumeStage = data.readiness.stages.find((s) => s.status !== "ready")?.key
    ?? data.onboarding?.currentStage ?? "business";
  // The five-item checklist groups the seven real stages for a glance-able
  // summary; it changes nothing about what Guided Setup itself walks
  // through — see app/dashboard/setup/page.tsx's own, unmodified OPEN_STAGES.
  const CHECKLIST: { key: string; label: string; stages: string[] }[] = [
    { key: "business", label: "Business details", stages: ["business"] },
    { key: "services", label: "Services", stages: ["trade", "services"] },
    { key: "pricing", label: "Pricing", stages: ["pricing-foundation"] },
    { key: "scheduling", label: "Scheduling", stages: ["scheduling", "payments"] },
    { key: "launch", label: "Review & launch", stages: ["launch"] },
  ];
  const stageStatus = new Map<string, string>(data.readiness.stages.map((s) => [s.key, s.status]));
  // "Review & launch" is a narrow stage in the readiness engine — it only
  // asks "is there anything to sell", so it can read "ready" while other
  // stages (business info, scheduling) still carry real blockers. Showing
  // that as a checked-off "Complete" would be exactly the false-positive
  // this redesign was warned against, just in a different stage than the
  // one already fixed (PricingFoundationPanel's material-status banner).
  // The launch checklist item uses the TRUE aggregate signal instead.
  const checklistDone = CHECKLIST.map((c) =>
    c.key === "launch" ? data.readiness.canLaunch : c.stages.every((k) => stageStatus.get(k) === "ready")
  );
  const stepsComplete = checklistDone.filter(Boolean).length;

  // Pricing readiness — the same offeredCount/unresolvedRoleCount split
  // PricingFoundationPanel.tsx uses, so this card can never disagree with
  // Guided Setup's own material-status banner about what "done" means.
  const roleFindings = (data.readiness.stages.find((s) => s.key === "pricing-foundation")?.findings ?? [])
    .filter((f) => f.code === "MATERIAL_COST_UNRESOLVED");
  const offeredCount = data.offered.length;
  const pricingReady = offeredCount > 0 && roleFindings.length === 0;

  // Next steps — the real blockers, in the order the readiness engine
  // already returns them, each with the href it already carries.
  // MATERIAL_COST_UNRESOLVED is excluded for the same reason
  // app/dashboard/setup/page.tsx's own findings list excludes it: its
  // message names a raw canonical-material key and a raw service slug
  // (`onboardingReadiness.ts` writes it for a batch-review panel to parse
  // back apart, not for prose), and the Pricing readiness card above
  // already surfaces the same fact in plain language with a real count.
  const nextSteps = data.readiness.blockers.filter((f) => f.code !== "MATERIAL_COST_UNRESOLVED").slice(0, 3);

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">
          {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-slate">
          Everything your customer sees traces back to something you control.
        </p>
      </header>

      {setupUnfinished && (
        <Card className="mt-6">
          <CardHeader
            title="Get set up and start taking bookings"
            description={`Complete these steps to get ${data.themeRow.name} ready for customers.`}
          />
          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto]">
            <ul className="space-y-3">
              {CHECKLIST.map((c, i) => (
                <li key={c.key} className="flex items-start gap-3">
                  {checklistDone[i] ? (
                    <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  ) : (
                    <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-p2b-amber-ink" />
                  )}
                  <div>
                    <p className={`text-sm font-semibold ${checklistDone[i] ? "text-navy" : "text-navy"}`}>{c.label}</p>
                    <p className="text-xs text-slate">
                      {checklistDone[i] ? "Complete" : c.key === "services" ? "Choose what you offer" : c.key === "pricing" ? "Set your rate and material costs" : c.key === "scheduling" ? "Set your availability and payments" : "Check your settings and go live"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="flex flex-col items-start justify-between gap-4 lg:items-end">
              <LinkButton href={`/dashboard/setup?stage=${resumeStage}`} variant="primary">
                Continue setup
              </LinkButton>
              <div className="w-full lg:w-48">
                <div className="h-2 overflow-hidden rounded-pill bg-cardline">
                  <div className="h-full rounded-pill bg-electric" style={{ width: `${(stepsComplete / CHECKLIST.length) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-right text-xs text-slate">{stepsComplete} of {CHECKLIST.length} steps complete</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader title="Your services" action={<Link href="/dashboard/services" className="text-sm font-medium text-electric hover:underline">Manage services</Link>} />
          <p className="mt-1 text-sm text-slate">{data.offered.length} selected of {total} in your catalog</p>
          {data.offered.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {data.offered.slice(0, 4).map((s) => (
                <li key={s.id} className="flex flex-col items-center gap-1.5 rounded-card border border-cardline p-3 text-center">
                  <ServiceIcon templateKey={s.templateKey} className="h-6 w-6 text-electric" />
                  <span className="text-xs font-medium text-navy">{s.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate">Choose the services you offer to get started.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Pricing readiness" action={<Link href="/dashboard/pricing-settings" className="text-sm font-medium text-electric hover:underline">View pricing</Link>} />
          <div className="mt-3 h-2 overflow-hidden rounded-pill bg-cardline">
            <div className={`h-full rounded-pill ${pricingReady ? "bg-success" : "bg-p2b-amber-ink"}`} style={{ width: offeredCount === 0 ? "0%" : `${Math.round(((offeredCount - roleFindings.length) / offeredCount) * 100)}%` }} />
          </div>
          {offeredCount === 0 ? (
            <p className="mt-3 text-sm text-slate">Choose your services first.</p>
          ) : roleFindings.length > 0 ? (
            <>
              <p className="mt-3 text-sm text-slate">
                {roleFindings.length} material cost{roleFindings.length === 1 ? "" : "s"} to review.
              </p>
              <Link href="/dashboard/setup?stage=pricing-foundation" className="mt-2 inline-block text-sm font-medium text-electric hover:underline">
                Review costs →
              </Link>
            </>
          ) : (
            <p className="mt-3 text-sm text-success">Everything you offer is costed.</p>
          )}
        </Card>

        <Card>
          <CardHeader title="Your storefront" action={site && <a href={`/${site}`} target="_blank" rel="noopener" className="text-sm font-medium text-electric hover:underline">Preview ↗</a>} />
          {site ? (
            <>
              <p className="mt-1 truncate text-sm text-slate">price2book.com/{site}</p>
              <p className="mt-1 text-xs text-slate">{design?.label ?? "Original layout"}</p>
            </>
          ) : (
            <p className="mt-1 text-sm text-slate">No storefront address yet.</p>
          )}
          <div className="mt-3">
            <Badge tone={launched ? "success" : "neutral"}>{launched ? "Live" : "Not launched"}</Badge>
          </div>
        </Card>
      </div>

      {nextSteps.length > 0 && (
        <Card className="mt-6">
          <CardHeader title="Your next steps" description="Keep going to get ready for launch." action={<Link href={`/dashboard/setup?stage=${resumeStage}`} className="text-sm font-medium text-electric hover:underline">View all steps →</Link>} />
          <ul className="mt-4 divide-y divide-cardline">
            {nextSteps.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-3">
                <div className="flex items-start gap-3">
                  <ChecklistIcon className="mt-0.5 h-5 w-5 shrink-0 text-slate" />
                  <p className="text-sm text-slate">{f.message}</p>
                </div>
                {f.href && (
                  <LinkButton href={f.href} variant="secondary" size="sm" className="shrink-0">
                    Fix <ArrowRightIcon className="h-3.5 w-3.5" />
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader title="Bookings" action={<Link href="/dashboard/bookings" className="text-sm font-medium text-electric hover:underline">View calendar →</Link>} />
        {data.bookingsTotal > 0 ? (
          <p className="mt-3 text-sm text-slate">
            <span className="font-semibold text-navy">{data.bookingsTotal}</span> booking{data.bookingsTotal === 1 ? "" : "s"} total.
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-3 text-sm text-slate">
            <CalendarIcon className="h-8 w-8 text-cardline" />
            <p>Your bookings will appear here after launch.</p>
          </div>
        )}
      </Card>

      {/* Stated, not merely implied. The narrow boundary is the sharpest thing
          this product has, and a dashboard is exactly where it erodes. */}
      <p className="mt-10 max-w-2xl border-t border-cardline pt-6 text-sm text-slate">
        Price2Book is pricing and booking software. Customers, invoices, payroll, dispatch and
        reporting stay in the system you already run — we hand the booked work across and get
        out of the way.
      </p>
    </div>
  );
}
