import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { findDefinition } from "@/lib/theme/definition";
import { resolveStorefrontTheme, readBrandInputs } from "@/lib/theme/resolve";
import { assessOnboarding, SETUP_SUMMARY_GROUPS, summaryGroupStatus, type GroupStatus, type OnboardingReadiness, type Finding } from "@/lib/onboardingReadiness";
import { actionLabelFor } from "@/lib/setupActionLabels";
import { findingSummary, groupHeadline } from "@/lib/setupFindingSummary";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServicesIllustration, PricingIllustration, BookingIllustration, EmptyCalendarIllustration } from "@/components/ui/illustrations";
import { CheckCircleIcon, AlertTriangleIcon, ArrowRightIcon } from "@/components/ui/icons";

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
    const [priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, offeredTotal, costedOffered, bookingsTotal] = await Promise.all([
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
      // Capped to 8 — this is a PREVIEW list for the four tiles the card
      // renders, never the count. A contractor with more than 8 selected
      // services would otherwise see "20 of 8" and a negative remaining
      // count, since `offered.length` could never exceed the cap.
      db.service.findMany({
        where: { offered: true },
        select: { id: true, slug: true, name: true, templateKey: true, active: true, publishedPriceApprovedAt: true, basePrice: true },
        orderBy: { name: "asc" }, take: 8,
      }),
      // The REAL total, uncapped — every count and percentage on this page
      // (Material costs, the Services checklist blurb, "N need review")
      // must divide against this, not against the length of the preview list.
      db.service.count({ where: { offered: true } }),
      // A same-shape count, not a second rule: "costed" is exactly the flag
      // the launch check and the material-baseline panel already trust.
      db.service.count({ where: { offered: true, materialCostResolved: true } }),
      db.booking.count(),
    ]);
    return { priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow, onboarding, readiness, offered, offeredTotal, costedOffered, bookingsTotal, userId: ctx.userId };
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
  // The first not-yet-ready group is "where you are" — everything after it
  // is simply not reached yet (a neutral number, not a warning), and
  // everything before it is ready by construction (resumeStage is the
  // FIRST non-ready stage anywhere in the readiness engine's own order).
  const currentGroupIndex = SETUP_SUMMARY_GROUPS.findIndex((g) => (g.stages as string[]).includes(resumeStage));

  // Material costs — a real, comparable proportion (costed OFFERED
  // services / offered services), never roles compared against services.
  // Shares its "nothing chosen yet" / "fully costed" split with the
  // PricingFoundationPanel banner, so the two can never disagree. This is
  // ONLY material-cost coverage — it says nothing about labor rate, price
  // approval, or pricing being finished, and the card's own copy is
  // written not to imply otherwise.
  // Services whose "Live" badge must NOT read as trouble-free — a service
  // can be active and still carry a real blocker (see Finding.serviceActive's
  // own comment). Checked by slug so the badge and "Your next steps" always
  // agree about which services still need something.
  const blockedSlugs = new Set(data.readiness.blockers.map((f) => f.serviceSlug).filter((s): s is string => !!s));
  // Reuses `liveServices` (already a real, un-truncated count) rather than
  // `data.offered`, which is capped to 8 rows for the services card and
  // would silently under-report on a larger catalog.
  const anyOfferedLive = liveServices > 0;
  // The REAL total — never `data.offered.length`, which is capped to 8 for
  // the preview tiles and would otherwise cap every count/percentage this
  // page derives (Material costs, "N need review", the Services blurb) at 8
  // regardless of how many services are actually selected.
  const offeredCount = data.offeredTotal;
  const pricingReady = offeredCount > 0 && data.costedOffered === offeredCount;
  const pricingPct = offeredCount === 0 ? 0 : Math.round((data.costedOffered / offeredCount) * 100);

  // Next steps — the real blockers, in the order the readiness engine
  // already returns them, each with the href it already carries.
  // MATERIAL_COST_UNRESOLVED is excluded for the same reason
  // app/dashboard/setup/page.tsx's own findings list excludes it: its
  // message names a raw canonical-material key and a raw service slug
  // (`onboardingReadiness.ts` writes it for a batch-review panel to parse
  // back apart, not for prose), and the Material costs card above
  // already surfaces the same fact in plain language with a real count.
  //
  // GROUPED BY SERVICE. Two blockers on the same service (a dead route AND
  // an unapproved price) used to render as two nearly-identical rows, both
  // naming the same slug. A Map keyed by serviceSlug — falling back to a
  // per-index key so a business-level finding never merges with anything —
  // preserves the engine's own order (first occurrence wins the slot) while
  // collapsing same-service findings into one task with the rest available
  // in a disclosure.
  const nextStepGroups = groupFindingsByService(
    data.readiness.blockers.filter((f) => f.code !== "MATERIAL_COST_UNRESOLVED")
  ).slice(0, 3);

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
                  <GroupStatusIcon index={i} currentIndex={currentGroupIndex} status={groupStatus[i]} isLaunch={g.key === "launch"} />
                  <div>
                    <p className="text-sm font-semibold text-navy">{g.label}</p>
                    <p className="text-xs text-slate">{groupBlurb(g.key, groupStatus[i], data.readiness, offeredCount, anyOfferedLive)}</p>
                  </div>
                </li>
              ))}
            </ul>

            {/* One composition: the journey, then its own primary action and
                progress directly beneath it — not a separate row stretched
                under the (taller) checklist column, which is what left a
                gap of empty space here before. */}
            <div className="flex flex-col">
              {/* Desktop journey. */}
              <div className="hidden lg:flex lg:items-start lg:justify-between lg:gap-2">
                <JourneyStep illustration={ServicesIllustration} caption="Choose your services" sub="Select the services you want to offer." />
                <DottedConnector />
                <JourneyStep illustration={PricingIllustration} caption="Set your pricing" sub="Add material costs and your labor rate." />
                <DottedConnector />
                <JourneyStep illustration={BookingIllustration} caption="Open for bookings" sub="Launch your storefront and start taking requests." />
              </div>
              {/* Compact mobile treatment — small, in a row, no desktop-sized gap. */}
              <div className="flex items-center justify-center gap-6 lg:hidden">
                <ServicesIllustration className="h-12 w-12" />
                <PricingIllustration className="h-12 w-12" />
                <BookingIllustration className="h-12 w-12" />
              </div>

              <div className="mt-5 flex flex-col gap-3 border-t border-cardline pt-4 sm:flex-row sm:items-center sm:justify-between">
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
          </div>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="p-5">
          <CardHeader title="Your services" action={<Link href="/dashboard/services" className="text-sm font-medium text-electric hover:underline">Manage services</Link>} />
          <p className="mt-1 text-sm text-slate">{offeredCount} selected of {total} in your catalog</p>
          {offeredCount > 0 ? (
            <ul className="mt-4 grid grid-cols-2 gap-3">
              {data.offered.slice(0, 4).map((s) => (
                <li key={s.id} className="flex flex-col items-center gap-1.5 rounded-card border border-cardline p-3 text-center">
                  <ServiceIcon templateKey={s.templateKey} className="h-10 w-10" />
                  <span className="text-xs font-medium text-navy">{s.name}</span>
                  <ServiceStatusBadge
                    active={s.active} approved={s.publishedPriceApprovedAt !== null} priced={s.basePrice !== null}
                    needsAttention={blockedSlugs.has(s.slug)}
                  />
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate">Choose the services you offer to get started.</p>
          )}
        </Card>

        <Card className="p-5">
          {/* This card measures MATERIAL-cost coverage only — the same
              costed/offered count Guided Setup's own material-status
              banner trusts. It says nothing about labor rate, price
              approval, or full pricing being finished, so the copy never
              claims more than that one fact. */}
          <CardHeader title="Material costs" action={<Link href="/dashboard/pricing-settings" className="text-sm font-medium text-electric hover:underline">View pricing</Link>} />
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
              <p className="mt-1.5 text-sm text-navy">Materials costed for {data.costedOffered} of {offeredCount} selected services.</p>
              {pricingReady ? (
                <p className="mt-2 text-sm text-success">Every service you offer has its materials costed.</p>
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

      {nextStepGroups.length > 0 && (
        <Card className="mt-6 p-5">
          <CardHeader title="Your next steps" description="Keep going to get ready for launch." action={<Link href={`/dashboard/setup?stage=${resumeStage}`} className="text-sm font-medium text-electric hover:underline">View all steps →</Link>} />
          <ul className="mt-3 divide-y divide-cardline">
            {nextStepGroups.map((group, i) => {
              const primary = group[0];
              return (
                <li key={i} className="py-2.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-p2b-amber-ink" />
                      <p className="text-sm text-slate">
                        {group.length === 1 ? findingSummary(primary) : groupHeadline(group)}
                      </p>
                    </div>
                    {primary.href && (
                      <LinkButton href={primary.href} variant="secondary" size="sm" className="shrink-0">
                        {actionLabelFor(primary.code)} <ArrowRightIcon className="h-3.5 w-3.5" />
                      </LinkButton>
                    )}
                  </div>
                  {/* Technical detail stays available rather than deleted —
                      just tucked behind a disclosure instead of repeated as
                      its own near-identical row for every finding. */}
                  {group.length > 1 && (
                    <details className="ml-7 mt-1.5">
                      <summary className="cursor-pointer text-xs font-medium text-slate">What's affected</summary>
                      <ul className="mt-1 space-y-1 text-xs text-slate">
                        {group.map((f, j) => <li key={j}>{findingSummary(f)}</li>)}
                      </ul>
                    </details>
                  )}
                </li>
              );
            })}
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
            {/* "After launch" is only true before the storefront is live —
                once it is (see StorefrontCard's own `launched`), a real
                homeowner could book at any moment, so saying "after launch"
                here too would contradict the "Live" badge above it. */}
            <p className="text-sm text-slate">
              {launched
                ? "Your bookings will appear here once a homeowner books."
                : "Your bookings will appear here after launch."}
            </p>
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

/**
 * Ordinary, unfinished setup should not look alarming — most contractors sit
 * in exactly that state for most of onboarding. A neutral numbered marker
 * says "you haven't gotten here yet"; a blue marker says "you are here."
 * Red is reserved for the one place a real problem stands between a
 * contractor and going live: Review & launch, still blocked. Every other
 * group's underlying readiness/launch restriction is unchanged by this —
 * only which icon represents the same status changes.
 */
function GroupStatusIcon({
  index, currentIndex, status, isLaunch,
}: { index: number; currentIndex: number; status: GroupStatus; isLaunch: boolean }) {
  if (status === "ready") return <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />;
  if (status === "not-applicable") return <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-cardline" />;
  if (isLaunch && status === "blocked") return <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />;
  const isCurrent = index === currentIndex;
  return (
    <span
      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
        isCurrent ? "bg-electric text-white" : "bg-cardline text-slate"
      }`}
    >
      {index + 1}
    </span>
  );
}

/** Findings for the same service collapse into one task; everything else
 *  (business/scheduling-level findings) stays its own row. First occurrence
 *  wins the slot, so the engine's own ordering survives the grouping. */
function groupFindingsByService(findings: Finding[]): Finding[][] {
  const groups = new Map<string, Finding[]>();
  findings.forEach((f, i) => {
    const key = f.serviceSlug ?? `__solo_${i}`;
    const arr = groups.get(key) ?? [];
    arr.push(f);
    groups.set(key, arr);
  });
  return [...groups.values()];
}

/**
 * What's actually left for one summary group — derived from its real
 * findings, never a fixed sentence that can't tell "nothing chosen" from
 * "chosen, but not yet ready to sell." Reading the live findings is what
 * keeps this from ever telling a contractor to do something they already did.
 */
function groupBlurb(
  key: string, status: GroupStatus, readiness: OnboardingReadiness, offeredCount: number, anyOfferedLive: boolean
): string {
  if (status === "ready") return "Complete";
  if (key === "services") {
    if (offeredCount === 0) return "Choose which of your services you offer";
    const n = readiness.stages
      .filter((s) => s.key === "trade" || s.key === "services")
      .reduce((sum, s) => sum + s.findings.length, 0);
    // "Before they're ready to sell" is only true when nothing is live yet.
    // At least one already-selling service with an open finding is a live
    // service that needs attention, not one still waiting to launch.
    return anyOfferedLive
      ? `${offeredCount} selected — ${n} issue${n === 1 ? "" : "s"} need${n === 1 ? "s" : ""} attention`
      : `${offeredCount} selected — ${n} issue${n === 1 ? "" : "s"} to resolve before ${n === 1 ? "it's" : "they're"} ready to sell`;
  }
  if (key === "pricing") {
    const findings = readiness.stages.find((s) => s.key === "pricing-foundation")?.findings ?? [];
    if (findings.some((f) => f.code === "NOTHING_OFFERED_YET")) return "Choose your services first";
    if (findings.some((f) => f.code === "PRICING_SETTINGS_MISSING" || f.code === "LABOR_RATE_UNSET" || f.code === "MINIMUM_UNSET")) {
      return "Set your labor rate and minimum";
    }
    if (findings.length > 0) return "Some material costs still need review";
    return "Set your labor rate and material costs";
  }
  const STATIC: Record<string, string> = {
    business: "Confirm your business details and storefront address",
    scheduling: "Set your availability and how deposits work",
    launch: "Review your settings and go live",
  };
  return STATIC[key] ?? "Review this section";
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

/**
 * "Live" alone would say the same thing for a healthy service and one with
 * an open blocker — exactly the contradiction "Your next steps" complained
 * about once shown side by side. A live service that still has a real
 * finding gets its own amber variant instead of a plain, all-clear "Live".
 */
function ServiceStatusBadge({
  active, approved, priced, needsAttention,
}: { active: boolean; approved: boolean; priced: boolean; needsAttention: boolean }) {
  if (active && needsAttention) return <Badge tone="attention">Live · needs attention</Badge>;
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
