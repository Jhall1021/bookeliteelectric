import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { findDefinition } from "@/lib/theme/definition";
import { resolveStorefrontTheme, readBrandInputs } from "@/lib/theme/resolve";
import { assessOnboarding, SETUP_SUMMARY_GROUPS, summaryGroupStatus } from "@/lib/onboardingReadiness";
import { actionLabelFor } from "@/lib/setupActionLabels";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServicesIllustration, PricingIllustration, BookingIllustration, EmptyCalendarIllustration } from "@/components/ui/illustrations";
import { CheckCircleIcon, ClockIcon, AlertTriangleIcon, ArrowRightIcon } from "@/components/ui/icons";

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
    const [priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, costedOffered, bookingsTotal] = await Promise.all([
      db.service.count({ where: { active: true, publishedPriceApprovedAt: { not: null } } }),
      db.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      db.service.count({ where: { active: true, publishedPriceApprovedAt: null, NOT: QUOTE_ONLY } }),
      db.service.count({ where: { active: false } }),
      // Both pre-price states count as "waiting on you": a homeowner cannot
      // tell the difference between submitted and in review, and neither can act.
      db.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      db.contractor.findUniqueOrThrow({
        where: { id: ctx.contractorId },
        select: { name: true, logoUrl: true, brandColors: true, themeFamily: true, themeVariant: true, themeVersion: true,
                  pricingStrategy: true, sites: { where: { active: true }, select: { hostedSlug: true }, take: 1 } },
      }),
      db.contractorOnboarding.findUnique({ where: { contractorId: ctx.contractorId }, select: { completedAt: true, currentStage: true } }),
      assessOnboarding(db, ctx.contractorId),
      db.service.findMany({
        where: { offered: true },
        select: { id: true, name: true, templateKey: true, active: true, publishedPriceApprovedAt: true, basePrice: true },
        orderBy: { name: "asc" }, take: 8,
      }),
      // A same-shape count, not a second rule: "costed" is exactly the flag
      // the launch check and the material-baseline panel already trust.
      db.service.count({ where: { offered: true, materialCostResolved: true } }),
      db.booking.count(),
    ]);
    return { priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, costedOffered, bookingsTotal, userId: ctx.userId };
  });

  // Person, not business — "Welcome back, Joshua" reads for the human at the
  // keyboard. User is cross-tenant identity, read the same way
  // resolveAdminContractor() itself reads it: bare, by primary key.
  const person = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
  const firstName = person?.name?.trim().split(/\s+/)[0] || null;

  const design = findDefinition(
    data.themeRow.themeFamily, data.themeRow.themeVariant, data.themeRow.themeVersion);
  const site = data.themeRow.sites[0] ?? null;
  const total = data.priced + data.quoteOnly + data.needsPrice + data.hidden;
  const liveServices = data.priced + data.quoteOnly;
  const launched = site !== null && liveServices > 0;

  // A schematic preview, not a screenshot: resolveStorefrontTheme is a pure,
  // in-memory computation over the SAME brand inputs the real storefront
  // resolves — no iframe, no render service, no per-request cost beyond the
  // contractor row already fetched above.
  const previewTheme = resolveStorefrontTheme(
    readBrandInputs(data.themeRow.brandColors),
    { family: data.themeRow.themeFamily, variant: data.themeRow.themeVariant, version: data.themeRow.themeVersion }
  );

  // Setup is unfinished exactly when there's no completion timestamp — never
  // inferred from readiness alone, since a launched contractor can still
  // pick up new warnings without that meaning "go back through setup".
  const setupUnfinished = data.onboarding?.completedAt == null;
  const resumeStage = data.readiness.stages.find((s) => s.status !== "ready")?.key
    ?? data.onboarding?.currentStage ?? "business";

  // The five-group summary is the ONE shared definition (lib/onboardingReadiness.ts)
  // Guided Setup's own seven stages are grouped under — never a second,
  // hand-rolled list that could silently drift from it.
  const groupStatus = SETUP_SUMMARY_GROUPS.map((g) => summaryGroupStatus(g, data.readiness));
  const stepsComplete = groupStatus.filter((s) => s === "ready").length;
  const GROUP_BLURB: Record<string, string> = {
    business: "Confirm your business details and storefront address",
    services: "Choose which of your services you offer",
    pricing: "Set your labor rate and material costs",
    scheduling: "Set your availability and how deposits work",
    launch: "Review your settings and go live",
  };

  // Pricing readiness — a real, comparable proportion (costed OFFERED
  // services / offered services), never roles compared against services.
  // Shares its "nothing chosen yet" / "fully costed" split with the
  // PricingFoundationPanel banner, so the two can never disagree.
  const offeredCount = data.offered.length;
  const pricingReady = offeredCount > 0 && data.costedOffered === offeredCount;
  const pricingPct = offeredCount === 0 ? 0 : Math.round((data.costedOffered / offeredCount) * 100);

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
        <Card className="mt-5 p-5">
          <CardHeader
            title="Get set up and start taking bookings"
            description={`Complete these steps to get ${data.themeRow.name} ready for customers.`}
          />

          <div className="mt-5 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_2fr]">
            <ul className="space-y-3">
              {SETUP_SUMMARY_GROUPS.map((g, i) => (
                <li key={g.key} className="flex items-start gap-3">
                  <GroupStatusIcon status={groupStatus[i]} />
                  <div>
                    <p className="text-sm font-semibold text-navy">{g.label}</p>
                    <p className="text-xs text-slate">{groupStatus[i] === "ready" ? "Complete" : GROUP_BLURB[g.key]}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* The illustrated journey — desktop only; mobile gets a
                compact strip below instead of this much whitespace. */}
            <div className="hidden lg:block">
              <div className="flex items-start justify-between gap-2">
                <JourneyStep illustration={ServicesIllustration} caption="Choose your services" sub="Select the services you want to offer." />
                <DottedConnector />
                <JourneyStep illustration={PricingIllustration} caption="Set your pricing" sub="Add material costs and your labor rate." />
                <DottedConnector />
                <JourneyStep illustration={BookingIllustration} caption="Open for bookings" sub="Launch your storefront and start taking requests." />
              </div>
            </div>
            {/* Compact mobile treatment — small, in a row, no desktop-sized gap. */}
            <div className="flex items-center justify-center gap-6 lg:hidden">
              <ServicesIllustration className="h-12 w-12" />
              <PricingIllustration className="h-12 w-12" />
              <BookingIllustration className="h-12 w-12" />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:col-start-2">
              <LinkButton href={`/dashboard/setup?stage=${resumeStage}`} variant="primary">
                Continue setup
              </LinkButton>
              <div className="w-full sm:w-56">
                <div className="h-2 overflow-hidden rounded-pill bg-cardline">
                  <div className="h-full rounded-pill bg-electric" style={{ width: `${(stepsComplete / SETUP_SUMMARY_GROUPS.length) * 100}%` }} />
                </div>
                <p className="mt-1.5 text-right text-xs text-slate">{stepsComplete} of {SETUP_SUMMARY_GROUPS.length} steps complete</p>
              </div>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Your services" action={<Link href="/dashboard/services" className="text-sm font-medium text-electric hover:underline">Manage services</Link>} />
          <p className="mt-1 text-sm text-slate">{data.offered.length} selected of {total} in your catalog</p>
          {data.offered.length > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {data.offered.slice(0, 4).map((s) => (
                <li key={s.id} className="flex flex-col items-center gap-1.5 rounded-card border border-cardline p-3 text-center">
                  <ServiceIcon templateKey={s.templateKey} className="h-10 w-10" />
                  <span className="text-xs font-medium text-navy">{s.name}</span>
                  <ServiceStatusBadge active={s.active} approved={s.publishedPriceApprovedAt !== null} priced={s.basePrice !== null} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate">Choose the services you offer to get started.</p>
          )}
        </Card>

        <Card className="p-5">
          <CardHeader title="Pricing readiness" action={<Link href="/dashboard/pricing-settings" className="text-sm font-medium text-electric hover:underline">View pricing</Link>} />
          {offeredCount === 0 ? (
            <>
              <div className="mt-3"><Badge tone="neutral">Nothing chosen yet</Badge></div>
              <p className="mt-3 text-sm text-slate">Choose your services first.</p>
            </>
          ) : (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-pill bg-cardline">
                <div className={`h-full rounded-pill ${pricingReady ? "bg-success" : "bg-electric"}`} style={{ width: `${pricingPct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-slate">{data.costedOffered} of {offeredCount} services costed</p>
              {pricingReady ? (
                <p className="mt-2 text-sm text-success">Everything you offer is costed.</p>
              ) : (
                <>
                  <div className="mt-2"><Badge tone="attention">{offeredCount - data.costedOffered} need{offeredCount - data.costedOffered === 1 ? "s" : ""} review</Badge></div>
                  <Link href="/dashboard/setup?stage=pricing-foundation" className="mt-2 inline-block text-sm font-medium text-electric hover:underline">
                    Review material costs →
                  </Link>
                </>
              )}
            </>
          )}
        </Card>

        <StorefrontCard
          site={site} launched={launched} designLabel={design?.label ?? "Original layout"}
          businessName={data.themeRow.name} logoUrl={data.themeRow.logoUrl} accentChannels={previewTheme.colors.accent}
        />
      </div>

      {nextSteps.length > 0 && (
        <Card className="mt-6 p-5">
          <CardHeader title="Your next steps" description="Keep going to get ready for launch." action={<Link href={`/dashboard/setup?stage=${resumeStage}`} className="text-sm font-medium text-electric hover:underline">View all steps →</Link>} />
          <ul className="mt-3 divide-y divide-cardline">
            {nextSteps.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-4 py-2.5">
                <div className="flex items-start gap-3">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-p2b-amber-ink" />
                  <p className="text-sm text-slate">{f.message}</p>
                </div>
                {f.href && (
                  <LinkButton href={f.href} variant="secondary" size="sm" className="shrink-0">
                    {actionLabelFor(f.code)} <ArrowRightIcon className="h-3.5 w-3.5" />
                  </LinkButton>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="mt-6 p-5">
        <CardHeader title="Bookings" action={<Link href="/dashboard/bookings" className="text-sm font-medium text-electric hover:underline">View calendar →</Link>} />
        {data.bookingsTotal > 0 ? (
          <p className="mt-3 text-sm text-slate">
            <span className="font-semibold text-navy">{data.bookingsTotal}</span> booking{data.bookingsTotal === 1 ? "" : "s"} total.
          </p>
        ) : (
          <div className="mt-2 flex items-center gap-4">
            <EmptyCalendarIllustration className="h-16 w-16 shrink-0" />
            <p className="text-sm text-slate">Your bookings will appear here after launch.</p>
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

function GroupStatusIcon({ status }: { status: "ready" | "warning" | "blocked" | "not-applicable" }) {
  if (status === "ready") return <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />;
  if (status === "blocked") return <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />;
  if (status === "not-applicable") return <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-cardline" />;
  return <ClockIcon className="mt-0.5 h-5 w-5 shrink-0 text-p2b-amber-ink" />;
}

function JourneyStep({
  illustration: Illustration, caption, sub,
}: { illustration: React.ComponentType<{ className?: string }>; caption: string; sub: string }) {
  return (
    <div className="flex w-32 shrink-0 flex-col items-center text-center">
      <Illustration className="h-28 w-28" />
      {/* Text lives outside the SVG — responsive, selectable, and read by a screen reader, unlike text baked into artwork. */}
      <p className="mt-1 text-sm font-semibold text-navy">{caption}</p>
      <p className="mt-0.5 text-xs text-slate">{sub}</p>
    </div>
  );
}

function DottedConnector() {
  return (
    <div className="mt-14 hidden flex-1 border-t-2 border-dotted border-cardline sm:block" aria-hidden="true" />
  );
}

function ServiceStatusBadge({ active, approved, priced }: { active: boolean; approved: boolean; priced: boolean }) {
  if (active) return <Badge tone="success">Live</Badge>;
  if (approved) return <Badge tone="info">Approved</Badge>;
  if (priced) return <Badge tone="neutral">Priced</Badge>;
  return <Badge tone="neutral">Selected</Badge>;
}

/**
 * A schematic preview — the contractor's real name, logo and resolved
 * accent color, laid out like a storefront card. Explicitly labeled
 * "Preview" so it is never mistaken for a screenshot of the real page: no
 * iframe is loaded and nothing is rendered server-side beyond the pure
 * color computation already done above.
 */
function StorefrontCard({
  site, launched, designLabel, businessName, logoUrl, accentChannels,
}: {
  site: { hostedSlug: string } | null;
  launched: boolean;
  designLabel: string;
  businessName: string;
  logoUrl: string | null;
  accentChannels: string;
}) {
  return (
    <Card className="p-5">
      <CardHeader
        title="Your storefront"
        action={site && (
          <a href={`/${site.hostedSlug}`} target="_blank" rel="noopener" className="text-sm font-medium text-electric hover:underline">
            Preview storefront ↗
          </a>
        )}
      />
      {site ? (
        <>
          <div
            className="relative mt-3 overflow-hidden rounded-card border border-cardline"
            style={{ "--preview-accent": accentChannels } as React.CSSProperties}
          >
            <div className="flex items-center gap-1.5 border-b border-cardline bg-warmwhite px-2 py-1.5">
              <span className="h-2 w-2 rounded-full bg-cardline" /><span className="h-2 w-2 rounded-full bg-cardline" /><span className="h-2 w-2 rounded-full bg-cardline" />
              <span className="ml-2 truncate text-[10px] text-slate">price2book.com/{site.hostedSlug}</span>
            </div>
            <div className="flex items-center gap-2 p-3">
              {logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
              ) : (
                <span className="h-6 w-6 shrink-0 rounded bg-[rgb(var(--preview-accent))]" />
              )}
              <span className="truncate text-xs font-semibold text-navy">{businessName}</span>
              <span className="ml-auto shrink-0 rounded-pill bg-[rgb(var(--preview-accent))] px-2 py-1 text-[10px] font-semibold text-white">
                Book a Service
              </span>
            </div>
            <span className="absolute right-2 top-2 rounded-pill bg-navy/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">
              Preview
            </span>
          </div>
          <p className="mt-2 text-xs text-slate">{designLabel}</p>
          <p className="mt-2 text-xs text-slate">
            Works as a hosted page or{" "}
            <Link href="/dashboard/setup?stage=business" className="font-medium text-electric hover:underline">embedded on your own site</Link>.
          </p>
        </>
      ) : (
        <div className="mt-2 flex flex-col items-center gap-3 py-2 text-center">
          <BookingIllustration className="h-16 w-16" />
          <p className="text-sm text-slate">You don&rsquo;t have a Price2Book storefront yet.</p>
          <LinkButton href="/dashboard/setup?stage=business" variant="secondary" size="sm">
            Set up booking page
          </LinkButton>
        </div>
      )}
      <div className="mt-3">
        <Badge tone={launched ? "success" : "neutral"}>{launched ? "Live" : "Not launched"}</Badge>
      </div>
    </Card>
  );
}
