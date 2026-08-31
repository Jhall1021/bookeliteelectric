import { withAdminContractor } from "@/lib/adminContext";
import { assessOnboarding, catalogPromises, type Finding } from "@/lib/onboardingReadiness";
import { categoryName, requireContractorCategory } from "@/lib/categories";
import ServiceSelectionList from "@/components/admin/ServiceSelectionList";
import SchedulingAuthorityControl from "./SchedulingAuthorityControl";
import BusinessPanel from "./BusinessPanel";
import StageRail from "./StageRail";
import TradePanel from "./TradePanel";
import PricingFoundationPanel, { type ServicePricing } from "./PricingFoundationPanel";
import {
  availableTrades, preflight, templateVersionSource, type CatalogPreview,
} from "@/lib/templateProvisioning";
import { suggestPrimaryPrice, formatBreakdown } from "@/lib/pricing";
import { loadPricingSettings } from "@/lib/routeResolver";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Guided Setup — one route, a stage rail, one panel at a time.
 *
 * It orchestrates. Every rule belongs to the system that already owns it, and
 * every "fix" is a link to the surface that already does that job. Guided
 * Setup writes exactly three kinds of fact: the contractor's own details,
 * which services they offer, and who owns their calendar. It cannot price
 * anything, approve anything or put anything on a storefront.
 *
 * Pricing, scheduling and payments appear as locked stages so the contractor
 * can see the whole journey. Locked here means the rail will not open them —
 * they have no panel and no writer in this slice.
 */

const OPEN_STAGES = ["business", "trade", "services", "pricing-foundation"] as const;

export default async function SetupPage({
  searchParams,
}: { searchParams?: { stage?: string } }) {
  return withAdminContractor(async (db, ctx) => {
    const r = await assessOnboarding(db, ctx.contractorId);

    const onboarding = await db.contractorOnboarding.findUnique({
      where: { contractorId: ctx.contractorId },
      select: { currentStage: true },
    });
    const requested = searchParams?.stage ?? onboarding?.currentStage ?? "business";
    const current = (OPEN_STAGES as readonly string[]).includes(requested) ? requested : "business";

    const c = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: {
        name: true, legalName: true, phone: true, supportEmail: true,
        licenseNumber: true, countryCode: true, trade: true, schedulingAuthority: true,
      },
    });
    const site = await db.contractorSite.findFirst({
      where: { contractorId: ctx.contractorId, active: true },
      select: { hostedSlug: true },
    });

    const stageMeta = r.stages.map((s) => ({
      key: s.key, title: s.title, status: s.status,
      blockers: s.findings.filter((f) => f.severity === "blocker").length,
      locked: !(OPEN_STAGES as readonly string[]).includes(s.key),
    }));
    const complete = r.stages.filter(
      (s) => (OPEN_STAGES as readonly string[]).includes(s.key) && s.status === "ready"
    ).length;

    const stage = r.stages.find((s) => s.key === current)!;

    // ── panel data ───────────────────────────────────────────────────────
    let selection: Awaited<ReturnType<typeof catalogPromises>> | null = null;
    let services: {
      id: string; name: string; categoryName: string | null;
      offered: boolean; active: boolean; promisesFixedPrice: boolean;
    }[] = [];
    let templateCount = 0;
    let trades: string[] = [];
    let enrolled: string | null = null;
    let preview: CatalogPreview | null = null;
    let previewError: string | null = null;
    let rateSettings: {
      crewHourRateCents: number; primaryMinimumCents: number;
      roundingIncrementCents: number; defaultPermitAdminCents: number;
    } | null = null;
    let pricing: ServicePricing[] = [];

    if (current === "services") {
      selection = await catalogPromises(db, ctx.contractorId);
      const rows = await db.service.findMany({
        where: { contractorId: ctx.contractorId },
        select: {
          id: true, slug: true, name: true, offered: true, active: true,
          contractorCategory: {
            select: { nameOverride: true, canonicalCategory: { select: { slug: true, name: true } } },
          },
        },
        orderBy: { name: "asc" },
      });
      services = rows.map((s) => ({
        id: s.id, name: s.name, offered: s.offered, active: s.active,
        categoryName: s.contractorCategory
          ? categoryName(requireContractorCategory(s.slug, s.contractorCategory))
          : null,
        promisesFixedPrice: selection!.get(s.id)?.promisesFixedPrice ?? true,
      }));
    }
    if (current === "trade") {
      templateCount = await db.service.count({
        where: { contractorId: ctx.contractorId, templateVersionId: { not: null } },
      });
      trades = await availableTrades(db);
      const enrolment = await db.contractorTrade.findFirst({
        where: { contractorId: ctx.contractorId }, orderBy: { enrolledAt: "asc" },
      });
      enrolled = enrolment?.tradeKey ?? null;
      if (enrolled) {
        // The SAME source the installer reads, so the preview cannot promise a
        // different catalog than the install delivers.
        const pre = await preflight(db, ctx.contractorId, templateVersionSource(prisma, enrolled));
        if (pre.ok) preview = pre.preview; else previewError = pre.message;
      }
    }

    if (current === "pricing-foundation") {
      rateSettings = await db.pricingSettings.findUnique({
        where: { contractorId: ctx.contractorId },
        select: {
          crewHourRateCents: true, primaryMinimumCents: true,
          roundingIncrementCents: true, defaultPermitAdminCents: true,
        },
      });
      let settings: unknown = null;
      try { settings = await loadPricingSettings(db as never, ctx.contractorId); } catch { settings = null; }
      if (settings) {
        const offeredRows = await db.service.findMany({
          where: { contractorId: ctx.contractorId, offered: true },
          orderBy: { name: "asc" },
        });
        const promises = await catalogPromises(db, ctx.contractorId);
        pricing = offeredRows.map((svc) => {
          const promisesFixedPrice = promises.get(svc.id)?.promisesFixedPrice ?? true;
          const b = promisesFixedPrice ? suggestPrimaryPrice(svc as never, settings as never) : null;
          return {
            slug: svc.slug, name: svc.name,
            derivedCents: b?.totalCents ?? null,
            publishedCents: svc.basePrice,
            approved: svc.publishedPriceApprovedAt !== null,
            promisesFixedPrice,
            breakdown: b && b.totalCents !== null ? formatBreakdown(b) : null,
          };
        });
      }
    }
    const totalServices = await db.service.count({ where: { contractorId: ctx.contractorId } });

    const findingRow = (f: Finding, i: number) => (
      <li key={i} className="flex items-start gap-2 text-sm">
        <span
          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
            f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"
          }`}
        />
        <span className="text-slate">
          {f.message}
          {f.href && f.href !== "/dashboard/setup" && (
            <Link href={f.href} className="ml-1 font-medium text-electric hover:underline">
              Fix
            </Link>
          )}
        </span>
      </li>
    );

    const blockersFirst = [...stage.findings].sort(
      (a, b) => (a.severity === "blocker" ? 0 : 1) - (b.severity === "blocker" ? 0 : 1)
    );

    return (
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-2xl font-bold text-navy">Set up your storefront</h1>
        {/* Stage completion and real counts, not a percentage — a meter that
            says 60% tells a contractor nothing about whether anyone can book. */}
        <p className="mt-1 text-sm text-slate">
          {complete} of {OPEN_STAGES.length} setup stages complete ·{" "}
          {r.canLaunch ? (
            <span className="font-medium text-success">no launch blockers</span>
          ) : (
            <span className="font-medium text-red-600">
              {r.blockers.length} launch blocker{r.blockers.length === 1 ? "" : "s"} remaining
            </span>
          )}
          {r.warnings.length > 0 && ` · ${r.warnings.length} to review`}
        </p>

        <div className="mt-8 grid gap-8 md:grid-cols-[220px_1fr]">
          <aside>
            <StageRail stages={stageMeta} current={current} />
          </aside>

          <main>
            <h2 className="font-display text-xl font-bold text-navy">{stage.title}</h2>

            {current === "business" && (
              <div className="mt-4">
                <BusinessPanel
                  profile={{
                    name: c.name, legalName: c.legalName, phone: c.phone,
                    supportEmail: c.supportEmail, licenseNumber: c.licenseNumber,
                    countryCode: c.countryCode,
                  }}
                  hostedSlug={site?.hostedSlug ?? null}
                />
              </div>
            )}

            {current === "trade" && (
              <div className="mt-4 space-y-4">
                <TradePanel
                  availableTrades={trades}
                  enrolled={enrolled}
                  installedCount={templateCount}
                  preview={preview}
                  previewError={previewError}
                />
                <p className="text-xs text-slate">
                  Your trade&rsquo;s catalog gives you the structure — the questions, the scope rules
                  and what each job includes. What it costs and what you charge stays yours.
                </p>
              </div>
            )}

            {current === "services" && (
              <div className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
                <p className="text-sm text-slate">
                  Choose the services you offer through Price2Book. You can change these anytime
                  later from{" "}
                  <Link href="/dashboard/services" className="text-electric hover:underline">
                    Services
                  </Link>
                  .
                </p>
                <div className="mt-4">
                  <ServiceSelectionList services={services} />
                </div>
              </div>
            )}

            {current === "pricing-foundation" && (
              <div className="mt-4">
                <PricingFoundationPanel
                  settings={rateSettings}
                  roleFindings={stage.findings.filter((f) => f.code === "MATERIAL_COST_UNRESOLVED")}
                  policyFindings={stage.findings.filter((f) => f.code === "POLICY_UNRESOLVED")}
                  services={pricing}
                  foundationClear={!stage.findings.some((f) => f.severity === "blocker")}
                />
              </div>
            )}

            {stage.key === "scheduling" && (
              <div className="mt-4">
                <SchedulingAuthorityControl
                  authority={c.schedulingAuthority as "NATIVE" | "EXTERNAL" | null}
                />
              </div>
            )}

            {blockersFirst.length > 0 && (
              <section className="mt-6 rounded-card border border-cardline bg-warmwhite p-5">
                <h3 className="text-sm font-semibold text-navy">
                  {stage.findings.some((f) => f.severity === "blocker")
                    ? "Before a homeowner can book"
                    : "Worth a look"}
                </h3>
                <ul className="mt-3 space-y-2">{blockersFirst.map(findingRow)}</ul>
              </section>
            )}

            {blockersFirst.length === 0 && (
              <p className="mt-6 text-sm text-success">Nothing outstanding here.</p>
            )}
          </main>
        </div>
      </div>
    );
  });
}
