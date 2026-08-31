/**
 * Can a real homeowner price and book from this contractor, right now?
 *
 * Guided Setup ORCHESTRATES. It owns no rules: every question below is already
 * answered by the system that owns it — §1.4 for publication, `connectReadiness`
 * for payments, `pricePromiseOf` for what a tree promises, `publicationHold`
 * for material cost holds. This assembles those answers into an order a
 * contractor can work through.
 *
 * THE FAILURE MODE THIS IS DESIGNED AGAINST
 *
 * A second validation system that disagrees with the first. A setup screen
 * saying a service is ready while §1.4 says it is not would be worse than no
 * screen at all, because the contractor would believe the screen.
 *
 * DERIVED, NEVER STORED
 *
 * Readiness is recomputed on every call. A stored flag goes stale the moment a
 * price is edited, a material cost moves or Stripe onboarding lapses — and it
 * goes stale in the dangerous direction, saying ready when it is not.
 */

import type { PrismaClient } from "@prisma/client";
import { connectReadiness } from "./stripeConnect";
import { pricePromiseOf } from "./activationOutcome";
import { suggestPrimaryPrice } from "./pricing";
import { servicesOnHold } from "./materialHolds";
import { loadServiceForResolution, loadPricingSettings } from "./routeResolver";

export type Severity = "blocker" | "warning";

/** Same shape as lib/pricingReadiness.ts's Blocker, plus where to go. */
export type Finding = {
  code: string;
  severity: Severity;
  message: string;
  serviceSlug?: string;
  href?: string;
};

export type StageKey =
  | "business" | "trade" | "pricing-foundation"
  | "services" | "scheduling" | "payments" | "launch";

export type Stage = {
  key: StageKey;
  title: string;
  status: "blocked" | "incomplete" | "warning" | "ready";
  findings: Finding[];
  href?: string;
};

export type OnboardingReadiness = {
  stages: Stage[];
  blockers: Finding[];
  warnings: Finding[];
  /** No blockers anywhere. Warnings never affect this. */
  canLaunch: boolean;
  /** The services this assessment was made against, and why each is included. */
  intended: { slug: string; reason: string }[];
  /** Facts the schema cannot currently express. Reported, not worked around. */
  notes: string[];
};

const b = (code: string, message: string, extra: Partial<Finding> = {}): Finding =>
  ({ code, severity: "blocker", message, ...extra });
const w = (code: string, message: string, extra: Partial<Finding> = {}): Finding =>
  ({ code, severity: "warning", message, ...extra });

/**
 * Which services is this contractor actually trying to launch?
 *
 * OUTCOME-AWARE, deliberately. "Has an approved price" is NOT a universal
 * proxy for intent: a REMOTE_QUOTE service legitimately has no `basePrice`,
 * and treating price as the signal would quietly exclude every quote-only
 * service from the payment and launch checks.
 *
 * THE SCHEMA HAS NO CLEAN ANSWER TO THIS. There is no contractor-owned
 * "I intend to offer this" fact — `active` means already live, and a
 * template-provisioned service the contractor has not decided about looks
 * identical to one they have. So V1 uses the best available signal and SAYS
 * SO, rather than letting a proxy harden into a rule:
 *
 *   active                          already live — unambiguously intended
 *   promises a price + approved     they priced it and approved it
 *   promises no price + configured  a quote-only service with a tree
 *
 * The third arm is the weak one, and it is why `notes` exists.
 */
async function intendedServices(
  db: PrismaClient,
  contractorId: string,
  settings: unknown
): Promise<{ svc: Record<string, unknown>; reason: string }[]> {
  const all = await db.service.findMany({ where: { contractorId } });
  const out: { svc: Record<string, unknown>; reason: string }[] = [];

  for (const s of all as unknown as Record<string, unknown>[]) {
    if (s.active) { out.push({ svc: s, reason: "already live" }); continue; }
    const full = settings ? await loadServiceForResolution(db as never, s.id as string) : null;
    const promise = pricePromiseOf(
      full ? ({ ...full, bookingType: s.bookingType } as never) : null,
      settings
    );
    if (promise.promisesFixedPrice) {
      if (s.basePrice !== null && s.publishedPriceApprovedAt !== null) {
        out.push({ svc: s, reason: "priced and approved, not yet live" });
      }
      continue;
    }
    // Quote-only or review-only: no price is expected, so price cannot be the
    // signal. A tree is the closest thing to a decision the schema records.
    if (full && (full as { questions: unknown[] }).questions.length > 0) {
      out.push({ svc: s, reason: "resolves by quote or review, and has a tree" });
    }
  }
  return out;
}

export async function assessOnboarding(
  db: PrismaClient,
  contractorId: string
): Promise<OnboardingReadiness> {
  const findings: Record<StageKey, Finding[]> = {
    business: [], trade: [], "pricing-foundation": [],
    services: [], scheduling: [], payments: [], launch: [],
  };
  const notes: string[] = [];

  // ── 1. Business ────────────────────────────────────────────────────────
  const c = await db.contractor.findUniqueOrThrow({ where: { id: contractorId } });
  const site = await db.contractorSite.findFirst({ where: { contractorId, active: true } });

  if (!c.name?.trim()) findings.business.push(b("BUSINESS_NAME_MISSING", "Your business name is empty — the storefront cannot render without it."));
  if (!site) findings.business.push(b("SITE_MISSING", "No active storefront address, so there is nowhere to send a homeowner."));
  if (!c.countryCode) findings.business.push(b("COUNTRY_MISSING", "No country set. Payments refuse before they reach Stripe without one."));
  if (!c.phone && !c.supportEmail) findings.business.push(w("CONTACT_MISSING", "No phone or support email. When scheduling is briefly unavailable, there is nothing to offer a stuck customer."));
  if (!c.licenseNumber) findings.business.push(w("LICENSE_MISSING", "No license number shown on your storefront."));
  if (!c.logoUrl) findings.business.push(w("BRANDING_DEFAULTS", "No logo uploaded — your storefront uses defaults."));

  // ── 2. Trade & template ────────────────────────────────────────────────
  const services = await db.service.findMany({
    where: { contractorId },
    select: { id: true, slug: true, templateVersionId: true, active: true },
  });
  if (services.length === 0) {
    findings.trade.push(b("NO_SERVICES", "No services yet. Install the Electrical template to get a catalog to price."));
  } else if (!services.some((s) => s.templateVersionId)) {
    findings.trade.push(w("TEMPLATE_NOT_INSTALLED", "No service came from a canonical template. Hand-built catalogs are supported but get no template updates."));
  }

  // ── 3. Pricing foundation ──────────────────────────────────────────────
  let settings: unknown = null;
  try {
    settings = await loadPricingSettings(db as never, contractorId);
  } catch {
    findings["pricing-foundation"].push(b("PRICING_SETTINGS_MISSING", "Your labor rate and minimum have not been set. Nothing can be priced until they are."));
  }
  const st = settings as { crewHourRateCents?: number; primaryMinimumCents?: number } | null;
  if (st && !(st.crewHourRateCents! > 0)) {
    findings["pricing-foundation"].push(b("LABOR_RATE_UNSET", "Your crew-hour rate is zero, so every price would be materials alone."));
  }
  if (st && st.primaryMinimumCents === 0) {
    findings["pricing-foundation"].push(w("MINIMUM_UNSET", "No service-call minimum. Short jobs will price at labor alone."));
  }

  const intended = await intendedServices(db, contractorId, settings);
  if (intended.length > 0 && !intended.some((i) => i.reason === "already live")) {
    notes.push(
      "No service is live yet, so 'intended for launch' was inferred from pricing " +
      "and tree configuration. The schema has no contractor-owned enablement fact."
    );
  }

  const held = settings ? await servicesOnHold(db, contractorId) : [];
  for (const h of held) {
    if (!intended.some((i) => i.svc.slug === h.slug)) continue;
    findings["pricing-foundation"].push(b("MATERIAL_COST_ON_HOLD",
      `${h.slug} depends on ${h.heldRoles.length} material cost(s) still on hold.`, { serviceSlug: h.slug }));
  }
  for (const { svc } of intended) {
    const unresolved = [
      ...((svc.unresolvedMaterialKeys as string[]) ?? []),
      ...((svc.unresolvedPolicyKeys as string[]) ?? []),
    ];
    if (svc.materialCostResolved === false || unresolved.length > 0) {
      findings["pricing-foundation"].push(b("MATERIAL_COSTS_UNRESOLVED",
        `${svc.slug} has ${unresolved.length || "some"} material or policy value(s) you have not costed yet.`,
        { serviceSlug: svc.slug as string }));
    }
  }

  // ── 4. Services & pricing review ───────────────────────────────────────
  for (const { svc } of intended) {
    const slug = svc.slug as string;
    const full = settings ? await loadServiceForResolution(db as never, svc.id as string) : null;
    const promise = pricePromiseOf(
      full ? ({ ...full, bookingType: svc.bookingType } as never) : null,
      settings
    );

    if (promise.routes.dead > 0) {
      findings.services.push(b("TREE_HAS_DEAD_ROUTE",
        `${slug} has ${promise.routes.dead} answer path(s) that reach nothing.`, { serviceSlug: slug }));
    }

    if (!promise.promisesFixedPrice) continue; // quote-only: no price is owed

    if (svc.publishedPriceApprovedAt === null) {
      findings.services.push(b("PRICE_NOT_APPROVED",
        // Strategy-neutral wording: this file is scanned by the storefront
        // copy linter, and a fixed-price claim is one TIME_AND_MATERIALS
        // cannot keep. What is true either way is that a route reaches an
        // amount and nobody has approved one.
        `${slug} reaches an amount for a homeowner, but none has been approved.`, { serviceSlug: slug }));
    }
    if (settings) {
      const derived = suggestPrimaryPrice(svc as never, settings as never).totalCents;
      if (derived === null) {
        findings.services.push(b("PRICE_UNDERIVABLE",
          `${slug} cannot be priced yet — an input is missing, not zero.`, { serviceSlug: slug }));
      } else if (svc.basePrice !== null && derived !== svc.basePrice) {
        findings.services.push(w("PRICE_DRIFTED",
          `${slug} publishes $${((svc.basePrice as number) / 100).toFixed(2)} but now derives $${(derived / 100).toFixed(2)}. Review and re-approve if you agree.`,
          { serviceSlug: slug }));
      } else if (svc.publishedPriceApprovedAt === null && derived !== null) {
        findings.services.push(w("SUGGESTED_NOT_APPROVED",
          `${slug} has a suggested price of $${(derived / 100).toFixed(2)} waiting for you to approve it.`,
          { serviceSlug: slug }));
      }
    }
    if (promise.routes.priced > 0 && promise.routes.review === 0) {
      findings.services.push(w("TREE_UNBOUNDED",
        `${slug} prices every answer path. Nothing sends an unusual job to review.`, { serviceSlug: slug }));
    }
  }

  // ── 5. Scheduling ──────────────────────────────────────────────────────
  //
  // Mode is INFERRED for this read-only slice: a contractor with a Jobber
  // connection is treated as external. Once Stage 5 exists, the declared
  // schedulingMode is authoritative and this inference goes away.
  const connection = await db.jobberConnection.findFirst({ where: { contractorId } });
  const mode: "EXTERNAL" | "STANDALONE" = connection ? "EXTERNAL" : "STANDALONE";
  const hours = await db.businessHours.findFirst({ where: { contractorId } });
  const area = await db.serviceArea.findFirst({ where: { contractorId, active: true } });
  const crews = await db.jobberCrewMember.count({
    where: { contractorId, eligibleForWebsiteBookings: true },
  });

  // A WARNING, not a blocker — checked rather than assumed. `loadBusinessHours`
  // falls back to DEFAULT_BUSINESS_HOURS when no row exists, so a homeowner can
  // still book; the contractor simply has not said whether those hours are
  // theirs. Elite has run live on that fallback throughout, which is how this
  // rule was caught overstating itself.
  if (!hours) {
    findings.scheduling.push(w("BUSINESS_HOURS_DEFAULTED",
      "You are using our default working hours and arrival windows. Confirm they match how you actually work."));
  }
  if (!area || area.zipCodes.length === 0) {
    findings.scheduling.push(b("SERVICE_AREA_EMPTY", "No service area, so every address a homeowner enters would be refused."));
  }
  // Zero eligible crew is a CONFIGURATION FAILURE when an external provider is
  // authoritative, and legitimate when it is not. Availability must never fall
  // back to native windows and present capacity nobody verified.
  if (mode === "EXTERNAL" && crews === 0) {
    findings.scheduling.push(b("NO_ELIGIBLE_CREW",
      "Jobber is your scheduling system but no crew is marked bookable, so nothing can be scheduled."));
  }

  // ── 6. Payments ────────────────────────────────────────────────────────
  //
  // Checked against the services actually intended, not globally. A contractor
  // who takes no deposits needs no Stripe, and blocking them would be wrong.
  const depositing = intended.filter((i) => ((i.svc.depositCents as number | null) ?? 0) > 0);
  if (depositing.length > 0) {
    const readiness = connectReadiness(c);
    if (!c.stripeAccountId) {
      findings.payments.push(b("STRIPE_NOT_CONNECTED",
        `${depositing.length} service(s) ask for a deposit, but Stripe is not connected.`));
    } else if (!readiness.ready) {
      findings.payments.push(b("STRIPE_NOT_READY",
        `Stripe is connected but cannot take payments yet — ${readiness.reason}.`));
    }
  }

  // ── 7. Launch ──────────────────────────────────────────────────────────
  if (intended.length === 0) {
    findings.launch.push(b("NOTHING_ACTIVATABLE",
      "Nothing is ready to sell yet. Price and approve at least one service."));
  }
  for (const i of intended) {
    if (i.svc.requiresPreWorkVisit && ((i.svc.depositCents as number | null) ?? 0) === 0) {
      findings.launch.push(w("PRE_WORK_WITHOUT_DEPOSIT",
        `${i.svc.slug} needs a site visit before installation but takes no deposit.`,
        { serviceSlug: i.svc.slug as string }));
    }
  }
  if (intended.length === 1) {
    findings.launch.push(w("SINGLE_SERVICE_LAUNCH", "You are launching with one service. That works — worth a second look first."));
  }

  const TITLES: Record<StageKey, string> = {
    business: "Business", trade: "Trade & services", "pricing-foundation": "Pricing foundation",
    services: "Services & pricing", scheduling: "Scheduling", payments: "Payments",
    launch: "Review & launch",
  };
  const HREF: Partial<Record<StageKey, string>> = {
    "pricing-foundation": "/dashboard/pricing-settings", services: "/dashboard/services",
    scheduling: "/dashboard/business-hours", payments: "/dashboard/payments",
  };

  const order: StageKey[] = ["business", "trade", "pricing-foundation", "services", "scheduling", "payments", "launch"];
  const stages: Stage[] = order.map((key) => {
    const f = findings[key];
    const hasBlocker = f.some((x) => x.severity === "blocker");
    return {
      key, title: TITLES[key], findings: f, href: HREF[key],
      status: hasBlocker ? "blocked" : f.length > 0 ? "warning" : "ready",
    };
  });

  const blockers = order.flatMap((k) => findings[k].filter((f) => f.severity === "blocker"));
  const warnings = order.flatMap((k) => findings[k].filter((f) => f.severity === "warning"));

  return {
    stages, blockers, warnings,
    // Warnings never gate a launch. They are things worth knowing, not things
    // that stop a homeowner booking safely.
    canLaunch: blockers.length === 0,
    intended: intended.map((i) => ({ slug: i.svc.slug as string, reason: i.reason })),
    notes,
  };
}
