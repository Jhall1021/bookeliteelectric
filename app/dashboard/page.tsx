import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { findDefinition } from "@/lib/theme/definition";
import { resolveStorefrontTheme, readBrandInputs } from "@/lib/theme/resolve";
import {
  assessOnboarding,
  SETUP_SUMMARY_GROUPS,
  summaryGroupStatus,
  type GroupStatus,
  type OnboardingReadiness,
  type Finding,
} from "@/lib/onboardingReadiness";
import { actionLabelFor } from "@/lib/setupActionLabels";
import { findingSummary, groupHeadline } from "@/lib/setupFindingSummary";
import { prisma } from "@/lib/prisma";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServiceStatusBadge } from "@/components/ui/ServiceStatusBadge";
import { BookingIllustration, EmptyCalendarIllustration } from "@/components/ui/illustrations";
import { CheckCircleIcon, AlertTriangleIcon, ArrowRightIcon } from "@/components/ui/icons";

export const dynamic = "force-dynamic";

export default async function PortalOverviewPage() {
  const data = await withAdminContractor(async (db, ctx) => {
    const QUOTE_ONLY = { bookingType: "REMOTE_QUOTE" as const };
    const [
      priced,
      quoteOnly,
      needsPrice,
      hidden,
      awaitingReview,
      themeRow,
      onboarding,
      readiness,
      offered,
      offeredTotal,
      costedOffered,
      bookingsTotal,
    ] = await Promise.all([
      db.service.count({ where: { active: true, publishedPriceApprovedAt: { not: null } } }),
      db.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      db.service.count({ where: { active: true, publishedPriceApprovedAt: null, NOT: QUOTE_ONLY } }),
      db.service.count({ where: { active: false } }),
      db.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      db.contractor.findUniqueOrThrow({
        where: { id: ctx.contractorId },
        select: {
          name: true,
          logoUrl: true,
          brandColors: true,
          themeFamily: true,
          themeVariant: true,
          themeVersion: true,
          pricingStrategy: true,
          sites: { where: { active: true }, select: { hostedSlug: true }, take: 1 },
        },
      }),
      db.contractorOnboarding.findUnique({
        where: { contractorId: ctx.contractorId },
        select: { completedAt: true, currentStage: true },
      }),
      assessOnboarding(db, ctx.contractorId),
      db.service.findMany({
        where: { offered: true },
        select: {
          id: true,
          slug: true,
          name: true,
          templateKey: true,
          active: true,
          publishedPriceApprovedAt: true,
          basePrice: true,
        },
        orderBy: { name: "asc" },
        take: 8,
      }),
      db.service.count({ where: { offered: true } }),
      db.service.count({ where: { offered: true, materialCostResolved: true } }),
      db.booking.count(),
    ]);

    return {
      priced,
      quoteOnly,
      needsPrice,
      hidden,
      awaitingReview,
      themeRow,
      onboarding,
      readiness,
      offered,
      offeredTotal,
      costedOffered,
      bookingsTotal,
      userId: ctx.userId,
    };
  });

  const person = await prisma.user.findUnique({ where: { id: data.userId }, select: { name: true } });
  const firstName = person?.name?.trim().split(/\s+/)[0] || null;

  const design = findDefinition(
    data.themeRow.themeFamily,
    data.themeRow.themeVariant,
    data.themeRow.themeVersion,
  );
  const site = data.themeRow.sites[0] ?? null;
  const total = data.priced + data.quoteOnly + data.needsPrice + data.hidden;
  const liveServices = data.priced + data.quoteOnly;
  const launched = site !== null && liveServices > 0;
  const previewTheme = resolveStorefrontTheme(
    readBrandInputs(data.themeRow.brandColors),
    { family: data.themeRow.themeFamily, variant: data.themeRow.themeVariant, version: data.themeRow.themeVersion },
  );

  const setupUnfinished = data.onboarding?.completedAt == null;
  const resumeStage = data.readiness.stages.find((s) => s.status !== "ready")?.key
    ?? data.onboarding?.currentStage
    ?? "business";
  const groupStatus = SETUP_SUMMARY_GROUPS.map((g) => summaryGroupStatus(g, data.readiness));
  const stepsComplete = groupStatus.filter((s) => s === "ready").length;
  const currentGroupIndex = SETUP_SUMMARY_GROUPS.findIndex((g) =>
    (g.stages as string[]).includes(resumeStage));

  const blockedSlugs = new Set(
    data.readiness.blockers.map((f) => f.serviceSlug).filter((s): s is string => !!s),
  );
  const anyOfferedLive = liveServices > 0;
  const offeredCount = data.offeredTotal;
  const pricingReady = offeredCount > 0 && data.costedOffered === offeredCount;
  const pricingPct = offeredCount === 0 ? 0 : Math.round((data.costedOffered / offeredCount) * 100);
  const nextStepGroups = groupFindingsByService(
    data.readiness.blockers.filter((f) => f.code !== "MATERIAL_COST_UNRESOLVED"),
  ).slice(0, 3);

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Overview</p>
          <h1 className="mt-1 font-display text-3xl font-extrabold tracking-[-0.035em] text-navy sm:text-[34px]">
            {firstName ? `Welcome back, ${firstName}` : "Welcome back"}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
            See what customers can book, what still needs your attention, and what is happening next.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={launched ? "success" : "neutral"}>{launched ? "Storefront live" : "Not launched"}</Badge>
          <LinkButton href="/dashboard/services" variant="secondary" size="sm">Manage services</LinkButton>
          {site && (
            <a
              href={`/${site.hostedSlug}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover"
            >
              View storefront ↗
            </a>
          )}
        </div>
      </header>

      <section className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Business snapshot">
        <SnapshotCard label="Live services" value={liveServices} helper={liveServices === 1 ? "service customers can use" : "services customers can use"} />
        <SnapshotCard label="Selected services" value={offeredCount} helper={total > 0 ? `of ${total} in your catalog` : "in your catalog"} />
        <SnapshotCard label="Bookings" value={data.bookingsTotal} helper="total booked through Price2Book" />
        <SnapshotCard label="Photo reviews" value={data.awaitingReview} helper={data.awaitingReview > 0 ? "waiting on you" : "nothing waiting"} attention={data.awaitingReview > 0} />
      </section>

      {setupUnfinished && (
        <Card className="mt-6 overflow-hidden" padding="none">
          <div className="grid lg:grid-cols-[1.1fr_1fr]">
            <div className="p-5 sm:p-6 lg:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-electric">Guided setup</p>
                  <h2 className="mt-1 font-display text-xl font-extrabold tracking-[-0.025em] text-navy">
                    Finish getting {data.themeRow.name} ready to book
                  </h2>
                  <p className="mt-2 max-w-xl text-sm leading-6 text-slate">
                    Work through the remaining decisions. Price2Book saves your place as you go.
                  </p>
                </div>
                <div className="hidden rounded-pill bg-electric/10 px-3 py-1.5 text-xs font-bold text-electric sm:block">
                  {stepsComplete}/{SETUP_SUMMARY_GROUPS.length} complete
                </div>
              </div>

              <div className="mt-5 h-2 overflow-hidden rounded-pill bg-cardline">
                <div
                  className="h-full rounded-pill bg-electric transition-all"
                  style={{ width: `${(stepsComplete / SETUP_SUMMARY_GROUPS.length) * 100}%` }}
                />
              </div>

              <div className="mt-5">
                <LinkButton href={`/dashboard/setup?stage=${resumeStage}`} variant="primary">
                  Continue setup <ArrowRightIcon className="h-4 w-4" />
                </LinkButton>
              </div>
            </div>

            <div className="border-t border-cardline bg-warmwhite/70 p-5 sm:p-6 lg:border-l lg:border-t-0 lg:p-7">
              <p className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-slate">Your setup path</p>
              <ul className="space-y-3">
                {SETUP_SUMMARY_GROUPS.map((g, i) => (
                  <li key={g.key} className={`flex items-start gap-3 rounded-card px-2 py-1.5 ${i === currentGroupIndex ? "bg-white shadow-sm" : ""}`}>
                    <GroupStatusIcon index={i} currentIndex={currentGroupIndex} status={groupStatus[i]} isLaunch={g.key === "launch"} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-navy">{g.label}</p>
                      <p className="mt-0.5 text-xs leading-5 text-slate">
                        {groupBlurb(g.key, groupStatus[i], data.readiness, offeredCount, anyOfferedLive)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.6fr)_minmax(320px,0.8fr)]">
        <div className="space-y-6">
          {nextStepGroups.length > 0 && (
            <Card>
              <CardHeader
                title="Needs your attention"
                description="These are the next things keeping a customer from getting all the way through."
                action={<Link href={`/dashboard/setup?stage=${resumeStage}`} className="text-sm font-semibold text-electric hover:underline">View setup</Link>}
              />
              <ul className="mt-4 space-y-2">
                {nextStepGroups.map((group, i) => {
                  const primary = group[0];
                  return (
                    <li key={i} className="rounded-card border border-cardline bg-warmwhite/50 p-3.5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-p2b-amber-bg">
                            <AlertTriangleIcon className="h-4 w-4 text-p2b-amber-ink" />
                          </span>
                          <div>
                            <p className="text-sm font-semibold text-navy">
                              {group.length === 1 ? findingSummary(primary) : groupHeadline(group)}
                            </p>
                            {group.length > 1 && (
                              <details className="mt-1">
                                <summary className="cursor-pointer text-xs font-medium text-slate">See what is affected</summary>
                                <ul className="mt-1.5 space-y-1 text-xs text-slate">
                                  {group.map((f, j) => <li key={j}>{findingSummary(f)}</li>)}
                                </ul>
                              </details>
                            )}
                          </div>
                        </div>
                        {primary.href && (
                          <LinkButton href={primary.href} variant="secondary" size="sm" className="shrink-0">
                            {actionLabelFor(primary.code)} <ArrowRightIcon className="h-3.5 w-3.5" />
                          </LinkButton>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Your services"
              description={`${offeredCount} selected${total > 0 ? ` of ${total} in your catalog` : ""}.`}
              action={<Link href="/dashboard/services" className="text-sm font-semibold text-electric hover:underline">Manage services</Link>}
            />
            {offeredCount > 0 ? (
              <ul className="mt-4 grid gap-2 sm:grid-cols-2">
                {data.offered.slice(0, 6).map((s) => (
                  <li key={s.id} className="flex items-center gap-3 rounded-card border border-cardline bg-white p-3 transition hover:border-electric/30">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-card bg-warmwhite">
                      <ServiceIcon templateKey={s.templateKey} className="h-8 w-8" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{s.name}</p>
                      <div className="mt-1">
                        <ServiceStatusBadge
                          active={s.active}
                          approved={s.publishedPriceApprovedAt !== null}
                          priced={s.basePrice !== null}
                          needsAttention={blockedSlugs.has(s.slug)}
                        />
                      </div>
                    </div>
                    <ArrowRightIcon className="h-4 w-4 shrink-0 text-slate/50" />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="mt-4 rounded-card border border-dashed border-cardline bg-warmwhite/50 p-5 text-center">
                <p className="text-sm font-semibold text-navy">Choose the services you want customers to book</p>
                <p className="mt-1 text-xs text-slate">You can start with only a few repetitive calls and add more later.</p>
                <Link href="/dashboard/setup?stage=services" className="mt-3 inline-block text-sm font-semibold text-electric hover:underline">Choose services →</Link>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Bookings"
              description={data.bookingsTotal > 0 ? `${data.bookingsTotal} booking${data.bookingsTotal === 1 ? "" : "s"} through Price2Book so far.` : "Your booked work will collect here."}
              action={<Link href="/dashboard/bookings" className="text-sm font-semibold text-electric hover:underline">View bookings</Link>}
            />
            {data.bookingsTotal > 0 ? (
              <div className="mt-4 flex items-center justify-between rounded-card bg-warmwhite p-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate">Total bookings</p>
                  <p className="mt-1 font-display text-3xl font-extrabold text-navy">{data.bookingsTotal}</p>
                </div>
                <BookingIllustration className="h-16 w-16" />
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-4 rounded-card bg-warmwhite/60 p-4">
                <EmptyCalendarIllustration className="h-16 w-16 shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-navy">No bookings yet</p>
                  <p className="mt-1 text-xs leading-5 text-slate">
                    {launched ? "Your first customer booking will show up here automatically." : "Finish setup and launch at least one service to start taking bookings."}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>

        <aside className="space-y-6">
          <StorefrontCard
            site={site}
            launched={launched}
            designLabel={design?.label ?? "Original layout"}
            businessName={data.themeRow.name}
            logoUrl={data.themeRow.logoUrl}
            accentChannels={previewTheme.colors.accent}
          />

          <Card>
            <CardHeader
              title="Material costs"
              action={<Link href="/dashboard/pricing-settings" className="text-sm font-semibold text-electric hover:underline">Open pricing</Link>}
            />
            {offeredCount === 0 ? (
              <div className="mt-4">
                <Badge tone="neutral">Choose services first</Badge>
                <p className="mt-3 text-sm leading-6 text-slate">Once you choose what you offer, Price2Book will show which material costs still need your review.</p>
              </div>
            ) : (
              <>
                <div className="mt-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="font-display text-3xl font-extrabold text-navy">{pricingPct}%</p>
                    <p className="mt-1 text-xs text-slate">material coverage</p>
                  </div>
                  <Badge tone={pricingReady ? "success" : "attention"}>
                    {pricingReady ? "Ready" : `${offeredCount - data.costedOffered} to review`}
                  </Badge>
                </div>
                <div className="mt-4 h-2 overflow-hidden rounded-pill bg-cardline">
                  <div className={`h-full rounded-pill ${pricingReady ? "bg-success" : "bg-electric"}`} style={{ width: `${pricingPct}%` }} />
                </div>
                <p className="mt-3 text-sm leading-6 text-slate">
                  Materials costed for <span className="font-semibold text-navy">{data.costedOffered} of {offeredCount}</span> selected services.
                </p>
                {!pricingReady && (
                  <Link href="/dashboard/setup?stage=pricing-foundation" className="mt-3 inline-block text-sm font-semibold text-electric hover:underline">Review material costs →</Link>
                )}
              </>
            )}
          </Card>

          <div className="rounded-card border border-cardline bg-navy p-5 text-white shadow-card">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white/50">Price2Book stays focused</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-white">Pricing and booking happen here. Your existing system can keep the rest.</p>
            <p className="mt-2 text-xs leading-5 text-white/60">Customers, invoices, payroll, dispatch and reporting do not need to move.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SnapshotCard({
  label,
  value,
  helper,
  attention = false,
}: {
  label: string;
  value: number;
  helper: string;
  attention?: boolean;
}) {
  return (
    <div className="rounded-card border border-cardline bg-white p-4 shadow-sm sm:p-5">
      <p className="text-xs font-semibold text-slate">{label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className={`font-display text-2xl font-extrabold tracking-[-0.03em] ${attention ? "text-p2b-amber-ink" : "text-navy"}`}>{value}</p>
        {attention && <span className="mb-1 h-2 w-2 rounded-full bg-amber-400" aria-hidden="true" />}
      </div>
      <p className="mt-1 text-[11px] leading-4 text-slate">{helper}</p>
    </div>
  );
}

function GroupStatusIcon({
  index,
  currentIndex,
  status,
  isLaunch,
}: {
  index: number;
  currentIndex: number;
  status: GroupStatus;
  isLaunch: boolean;
}) {
  if (status === "ready") return <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-success" />;
  if (status === "not-applicable") return <span className="mt-1 h-3 w-3 shrink-0 rounded-full bg-cardline" />;
  if (isLaunch && status === "blocked") return <AlertTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />;
  const isCurrent = index === currentIndex;
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${isCurrent ? "bg-electric text-white" : "bg-cardline text-slate"}`}>
      {index + 1}
    </span>
  );
}

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

function groupBlurb(
  key: string,
  status: GroupStatus,
  readiness: OnboardingReadiness,
  offeredCount: number,
  anyOfferedLive: boolean,
): string {
  if (status === "ready") return "Complete";
  if (key === "services") {
    if (offeredCount === 0) return "Choose which of your services you offer";
    const n = readiness.stages
      .filter((s) => s.key === "trade" || s.key === "services")
      .reduce((sum, s) => sum + s.findings.length, 0);
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

function StorefrontCard({
  site,
  launched,
  designLabel,
  businessName,
  logoUrl,
  accentChannels,
}: {
  site: { hostedSlug: string } | null;
  launched: boolean;
  designLabel: string;
  businessName: string;
  logoUrl: string | null;
  accentChannels: string;
}) {
  return (
    <Card>
      <CardHeader
        title="Your storefront"
        description={launched ? "What customers can reach right now." : "Preview the booking experience before you launch."}
        action={site && (
          <a href={`/${site.hostedSlug}`} target="_blank" rel="noopener" className="text-sm font-semibold text-electric hover:underline">
            Open ↗
          </a>
        )}
      />
      {site ? (
        <>
          <div
            className="relative mt-4 overflow-hidden rounded-card border border-cardline bg-white shadow-sm"
            style={{ "--preview-accent": accentChannels } as React.CSSProperties}
          >
            <div className="flex items-center gap-1.5 border-b border-cardline bg-warmwhite px-2.5 py-2">
              <span className="h-2 w-2 rounded-full bg-cardline" />
              <span className="h-2 w-2 rounded-full bg-cardline" />
              <span className="h-2 w-2 rounded-full bg-cardline" />
              <span className="ml-1 min-w-0 truncate text-[10px] text-slate">price2book.com/{site.hostedSlug}</span>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logoUrl} alt="" className="h-8 w-8 shrink-0 rounded object-contain" />
                ) : (
                  <span className="h-8 w-8 shrink-0 rounded-card bg-[rgb(var(--preview-accent))]" />
                )}
                <span className="truncate text-sm font-semibold text-navy">{businessName}</span>
              </div>
              <div className="mt-4 rounded-card bg-warmwhite p-3">
                <div className="h-2 w-3/4 rounded-pill bg-cardline" />
                <div className="mt-2 h-2 w-1/2 rounded-pill bg-cardline" />
                <span className="mt-4 inline-flex rounded-pill bg-[rgb(var(--preview-accent))] px-3 py-1.5 text-[10px] font-semibold text-white">Book a Service</span>
              </div>
            </div>
            <span className="absolute right-2 top-2 rounded-pill bg-navy/80 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-white">Preview</span>
          </div>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate">{designLabel}</p>
            <Badge tone={launched ? "success" : "neutral"}>{launched ? "Live" : "Not launched"}</Badge>
          </div>
          <p className="mt-3 text-xs leading-5 text-slate">
            Best used on your own website. The hosted page remains available as a fallback.
          </p>
          <Link href="/dashboard/design" className="mt-3 inline-block text-sm font-semibold text-electric hover:underline">Customize storefront →</Link>
        </>
      ) : (
        <div className="mt-4 flex flex-col items-center rounded-card bg-warmwhite/60 px-4 py-6 text-center">
          <BookingIllustration className="h-16 w-16" />
          <p className="mt-2 text-sm font-semibold text-navy">Your booking page is not set up yet</p>
          <p className="mt-1 text-xs leading-5 text-slate">Create it now, then decide whether to embed it on your website.</p>
          <LinkButton href="/dashboard/setup?stage=business" variant="secondary" size="sm" className="mt-3">Set up booking page</LinkButton>
        </div>
      )}
    </Card>
  );
}
