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
import { servicesWithoutAddOnPrice } from "./sameVisit";
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
 * Which services is this contractor trying to launch?
 *
 * `Service.offered` — a fact the contractor set, not an inference.
 *
 * Slice one had to guess: it read an approved price as intent, which is wrong
 * for every legitimately quote-only service, and said so in `notes` rather
 * than pretending otherwise. The guess is gone. Selection is now independent
 * of price by construction, so a REMOTE_QUOTE service is included in
 * readiness without anyone manufacturing a number for it.
 */
async function offeredServices(db: PrismaClient, contractorId: string) {
  return (await db.service.findMany({
    where: { contractorId, offered: true },
    orderBy: { slug: "asc" },
  })) as unknown as Record<string, unknown>[];
}

/**
 * What this service promises a homeowner — the ONE implementation.
 *
 * The setup screen previews what selecting a service will require ("needs a
 * price", "quote only"). That preview must come from the same logic as the
 * readiness verdict, or the two eventually disagree and the contractor
 * believes whichever they read first. So both call this.
 */
export async function promiseFor(
  db: PrismaClient,
  svc: { id: string; bookingType: string },
  settings: unknown
) {
  const full = settings ? await loadServiceForResolution(db as never, svc.id) : null;
  // The booking type survives a missing pricing configuration. Losing it told
  // every quote-only service it owed an approved price.
  return pricePromiseOf(
    (full
      ? { ...full, bookingType: svc.bookingType }
      : { questions: [], bookingType: svc.bookingType }) as never,
    settings
  );
}

export type CatalogPromise = {
  promisesFixedPrice: boolean;
  /** Services a customer route hands off to. They must be live for it to work. */
  handoffTargets: string[];
  /** A route sends the homeowner to the diagnostic, which isn't live. */
  needsDiagnostic: boolean;
};

/** Per-service promises for a whole catalog, for the selection screen. */
export async function catalogPromises(
  db: PrismaClient,
  contractorId: string
): Promise<Map<string, CatalogPromise>> {
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db as never, contractorId); } catch { settings = null; }
  const services = await db.service.findMany({
    where: { contractorId }, select: { id: true, bookingType: true },
  });
  const out = new Map<string, CatalogPromise>();
  for (const s of services) {
    const p = await promiseFor(db, s as { id: string; bookingType: string }, settings);
    out.set(s.id, {
      promisesFixedPrice: p.promisesFixedPrice,
      handoffTargets: p.handoffTargets,
      needsDiagnostic: p.deadReasons.some((r) => /routes to troubleshooting/.test(r)),
    });
  }
  return out;
}

/** "Actual field labor hours…" reads better mid-sentence than shouted. */
function lowerFirst(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s;
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

  const IN_SETUP = "/dashboard/setup";
  if (!c.name?.trim()) findings.business.push(b("BUSINESS_NAME_MISSING", "Your business name is empty — the storefront cannot render without it.", { href: IN_SETUP }));
  // Actionable now: the contractor creates their own storefront, and the
  // server issues the routing identity. It used to be a blocker with nobody
  // to ask.
  if (!site) findings.business.push(b("SITE_MISSING", "You don't have a Price2Book storefront yet, so there is nowhere to send a homeowner.", { href: IN_SETUP }));
  if (!c.countryCode) findings.business.push(b("COUNTRY_MISSING", "No country set. Payments refuse before they reach Stripe without one.", { href: IN_SETUP }));
  if (!c.phone && !c.supportEmail) findings.business.push(w("CONTACT_MISSING", "No phone or support email. When scheduling is briefly unavailable, there is nothing to offer a stuck customer.", { href: IN_SETUP }));
  if (!c.licenseNumber) findings.business.push(w("LICENSE_MISSING", "No license number shown on your storefront.", { href: IN_SETUP }));
  if (!c.logoUrl) findings.business.push(w("BRANDING_DEFAULTS", "No logo uploaded — your storefront uses defaults.", { href: "/dashboard/design" }));

  // ── 2. Trade & template ────────────────────────────────────────────────
  const services = await db.service.findMany({
    where: { contractorId },
    select: { id: true, slug: true, templateVersionId: true, active: true },
  });
  const enrolment = await db.contractorTrade.findFirst({
    where: { contractorId }, orderBy: { enrolledAt: "asc" },
  });

  // Enrolment is what lets a contractor INSTALL a catalog — it is not a
  // condition of being ready. Elite has 79 services, a live storefront and no
  // enrolment at all, because its catalog predates templates; demanding one
  // would tell a working business it could not launch. So the blocker only
  // applies to a contractor who has nothing to sell yet.
  if (services.length === 0) {
    if (!enrolment) {
      findings.trade.push(b("TRADE_NOT_SELECTED",
        "Tell us your trade so we can give you the right catalog to price.", { href: IN_SETUP }));
    }
  }
  if (services.length === 0 && enrolment) {
    // Trade-neutral on purpose. Electrical is the first Guided Setup trade,
    // not the shape of the framework — Plumbing will install through the same
    // path and is structurally different.
    findings.trade.push(b("NO_SERVICES", "No services yet. Installing your trade's catalog gives you something to price.", { href: "/dashboard/services" }));
  } else if (!services.some((s) => s.templateVersionId)) {
    findings.trade.push(w("TEMPLATE_NOT_INSTALLED", "No service came from a canonical template. Hand-built catalogs are supported but get no template updates.", { href: "/dashboard/services" }));
  }

  // ── 3. Pricing foundation ──────────────────────────────────────────────
  let settings: unknown = null;
  try {
    settings = await loadPricingSettings(db as never, contractorId);
  } catch {
    findings["pricing-foundation"].push(b("PRICING_SETTINGS_MISSING", "Your labor rate and minimum have not been set. Nothing can be priced until they are.", { href: "/dashboard/pricing-settings" }));
  }
  const st = settings as { crewHourRateCents?: number; primaryMinimumCents?: number } | null;
  if (st && !(st.crewHourRateCents! > 0)) {
    findings["pricing-foundation"].push(b("LABOR_RATE_UNSET", "Your crew-hour rate is zero, so every price would be materials alone.", { href: "/dashboard/pricing-settings" }));
  }
  if (st && st.primaryMinimumCents === 0) {
    findings["pricing-foundation"].push(w("MINIMUM_UNSET", "No service-call minimum. Short jobs will price at labor alone.", { href: "/dashboard/pricing-settings" }));
  }

  const offered = await offeredServices(db, contractorId);
  const intended = offered.map((svc) => ({
    svc,
    reason: svc.active ? "offered and live" : "offered, not yet live",
  }));

  const held = settings ? await servicesOnHold(db, contractorId) : [];
  for (const h of held) {
    if (!intended.some((i) => i.svc.slug === h.slug)) continue;
    findings["pricing-foundation"].push(b("MATERIAL_COST_ON_HOLD",
      `${h.slug} depends on ${h.heldRoles.length} material cost(s) still on hold.`,
      { serviceSlug: h.slug, href: "/dashboard/services" }));
  }
  // GROUPED BY ROLE, not repeated per service.
  //
  // One uncosted role blocks every service that uses it — 38 roles across 75
  // services is 38 decisions, not 75 problems. Listing it per service makes
  // one decision look like dozens and hides how few are actually left.
  const roleToServices = new Map<string, string[]>();
  const policyToServices = new Map<string, string[]>();
  for (const { svc } of intended) {
    for (const k of (svc.unresolvedMaterialKeys as string[]) ?? []) {
      (roleToServices.get(k) ?? roleToServices.set(k, []).get(k)!).push(svc.slug as string);
    }
    for (const k of (svc.unresolvedPolicyKeys as string[]) ?? []) {
      (policyToServices.get(k) ?? policyToServices.set(k, []).get(k)!).push(svc.slug as string);
    }
  }
  for (const [role, slugs] of [...roleToServices].sort()) {
    // Material costs are edited on a service's Materials panel; there is no
    // role-level surface yet. Naming one service that uses the role keeps the
    // link actionable without pretending a page exists.
    findings["pricing-foundation"].push(b("MATERIAL_COST_UNRESOLVED",
      `You haven't told us what ${role} costs you — ${slugs.length} service${slugs.length === 1 ? "" : "s"} need${slugs.length === 1 ? "s" : ""} it, including ${slugs[0]}.`,
      { href: "/dashboard/services" }));
  }
  // ASKS THE QUESTION, rather than naming the key.
  //
  // This read "One of your policies is undecided (fixture_work_height.breakpoints)"
  // and linked to the service list, where there was nothing to do about it —
  // no surface for deciding a policy existed at all. The prompt is written in
  // the contractor's language and is already stored on the row.
  const policyPrompts = new Map(
    (await db.contractorPolicyValue.findMany({
      where: { contractorId }, select: { key: true, prompt: true },
    })).map((v) => [v.key, v.prompt])
  );
  for (const [key, slugs] of [...policyToServices].sort()) {
    const ask = policyPrompts.get(key);
    findings["pricing-foundation"].push(b("POLICY_UNRESOLVED",
      ask
        ? `${ask} — ${slugs.length} service${slugs.length === 1 ? "" : "s"} can't be priced until you say, including ${slugs[0]}.`
        : `One of your policies is undecided (${key}) — ${slugs.length} service${slugs.length === 1 ? "" : "s"} depend${slugs.length === 1 ? "s" : ""} on it.`,
      { href: "/dashboard/policies" }));
  }

  // ── 4. Services & pricing review ───────────────────────────────────────
  //
  // The diagnostic, because a great many trees hand off to it. Whether a dead
  // route is a defect or merely a sequencing fact depends entirely on whether
  // this service exists and is on its way live.
  // G2. This was a local `findFirst` with no `orderBy`, which silently picked
  // a row — non-deterministically in Postgres — and on a multi-trade contractor
  // could report readiness about ANOTHER trade's diagnostic. It is now resolved
  // per service, from that service's own trade, through the one authority.
  //
  // Cached per trade because the loop below asks once per service and most
  // catalogs are single-trade; the lookup is the same question every time.
  //
  // A SECOND QUERY BY NECESSITY, NOT BY DRIFT.
  //
  // `findTroubleshootingService` answers a deliberately narrow runtime question:
  // "what ACTIVE diagnostic can this customer be routed to in this trade?"
  // Readiness asks a different one: "is there a diagnostic prerequisite in this
  // trade, and what STATE is it in?" — and it needs the row precisely when it is
  // NOT yet active, because "offered but not live" is the sequencing note it
  // reports rather than a blocker. Teaching the runtime authority to optionally
  // return inactive rows would blur a safety boundary that is currently useful.
  //
  // Availability semantics differ. IDENTITY SEMANTICS ARE IDENTICAL:
  //   contractor + EXACT tradeKey, so other trades are invisible;
  //   zero same-trade candidates is a distinct, deliberate outcome;
  //   multiple same-trade candidates REFUSE rather than picking a row.
  type DiagnosticState =
    | { kind: "ONE"; name: string; offered: boolean; active: boolean }
    | { kind: "NONE" }
    | { kind: "AMBIGUOUS" };
  const diagnosticByTrade = new Map<string, DiagnosticState>();
  const diagnosticFor = async (tradeKey: string | null): Promise<DiagnosticState> => {
    // No trade established: not "no diagnostic", but "this service cannot say
    // what its prerequisite would be". Fails closed the same way, and does not
    // pretend the contractor is missing something they may well have.
    if (!tradeKey) return { kind: "NONE" };
    const cached = diagnosticByTrade.get(tradeKey);
    if (cached) return cached;
    const rows = await db.service.findMany({
      where: { contractorId, tradeKey, bookingType: "TROUBLESHOOT_ONLY" },
      select: { name: true, offered: true, active: true },
      orderBy: { slug: "asc" },
    });
    const state: DiagnosticState =
      rows.length === 1
        ? { kind: "ONE", ...rows[0] }
        : rows.length === 0
          ? { kind: "NONE" }
          // Two diagnostics in one trade is a catalog defect the runtime
          // authority refuses. Readiness must not resolve it by choosing one —
          // that is the silent `findFirst` this replaced.
          : { kind: "AMBIGUOUS" };
    diagnosticByTrade.set(tradeKey, state);
    return state;
  };

  for (const { svc } of intended) {
    const slug = svc.slug as string;
    const promise = await promiseFor(
      db, { id: svc.id as string, bookingType: svc.bookingType as string }, settings
    );

    if (promise.routes.dead > 0) {
      // A DEADLOCK, FOUND BY CLICKING THROUGH IT.
      //
      // Every one of these dead routes was "goes to troubleshooting, and
      // there is no live diagnostic". That is true, and it is fixed by
      // launching the diagnostic — which this finding, as a blocker,
      // prevented: Review & launch disabled its own button and told the
      // contractor to sort the blockers first. There was no order in which
      // they could.
      //
      // The finding is about a LIVE storefront leading a homeowner nowhere. A
      // service that is not live yet leads nobody anywhere, and activation
      // already refuses in dependency order, so while the prerequisite is
      // merely waiting its turn this is a note about sequence.
      //
      // Still a blocker when the destination does not exist or is not being
      // offered at all: no launch will fix that one.
      const onlyDiagnostic = promise.deadReasons.every((r) => /routes to troubleshooting/.test(r));
      const diagnostic = await diagnosticFor((svc.tradeKey as string | null) ?? null);
      // Only a single, offered, not-yet-live diagnostic in this service's own
      // trade turns a dead route into a sequencing note. NONE and AMBIGUOUS
      // both stay blockers — no launch order fixes either.
      const resolvesOnLaunch =
        onlyDiagnostic && diagnostic.kind === "ONE" && diagnostic.offered && !diagnostic.active;

      findings.services.push(
        resolvesOnLaunch
          ? w("HANDOFF_NOT_LIVE_YET",
              `${slug} sends "it stopped working" to ${diagnostic.kind === "ONE" ? diagnostic.name : "your diagnostic"}, which isn't live yet. ` +
              `Put that live and this resolves itself — we launch it first for you.`,
              { serviceSlug: slug, href: IN_SETUP })
          : b("TREE_HAS_DEAD_ROUTE",
              `${slug} has ${promise.routes.dead} answer path(s) that reach nothing.`,
              { serviceSlug: slug, href: "/dashboard/services" })
      );
    }

    if (!promise.promisesFixedPrice) continue; // quote-only: no price is owed

    if (svc.publishedPriceApprovedAt === null) {
      findings.services.push(b("PRICE_NOT_APPROVED",
        // Strategy-neutral wording: this file is scanned by the storefront
        // copy linter, and a fixed-price claim is one TIME_AND_MATERIALS
        // cannot keep. What is true either way is that a route reaches an
        // amount and nobody has approved one.
        `${slug} reaches an amount for a homeowner, but none has been approved.`,
        { serviceSlug: slug, href: "/dashboard/services" }));
    }
    if (settings) {
      const suggestion = suggestPrimaryPrice(svc as never, settings as never);
      const derived = suggestion.totalCents;
      if (derived === null) {
        // NAMES THE INPUT, AND LINKS TO WHERE IT IS EDITED.
        //
        // This said "an input is missing, not zero" and pointed at the service
        // list. Both halves failed a real contractor: BrightPath reached Review
        // & Launch with four services and no way to learn that what was missing
        // was crew-hours, or that the field for them is on each service's own
        // pricing panel. The engine has always said which input it wanted —
        // this passes that sentence through instead of paraphrasing it away.
        //
        // Deliberately NOT auto-filled. How long a job takes is the
        // contractor's own number, and inventing one to clear a blocker is the
        // §3.1 defect the engine refuses a price to avoid.
        findings.services.push(b("LABOR_INPUTS_MISSING",
          `${slug} can't be priced yet — ${lowerFirst(suggestion.unavailableReason ?? "an input is missing, not zero")}.`,
          { serviceSlug: slug, href: `/dashboard/services/${svc.id as string}` }));
      } else if (svc.basePrice !== null && derived !== svc.basePrice) {
        findings.services.push(w("PRICE_DRIFTED",
          `${slug} publishes $${((svc.basePrice as number) / 100).toFixed(2)} but now derives $${(derived / 100).toFixed(2)}. Review and re-approve if you agree.`,
          { serviceSlug: slug, href: "/dashboard/services" }));
      } else if (svc.publishedPriceApprovedAt === null && derived !== null) {
        findings.services.push(w("SUGGESTED_NOT_APPROVED",
          `${slug} has a suggested price of $${(derived / 100).toFixed(2)} waiting for you to approve it.`,
          { serviceSlug: slug, href: "/dashboard/services" }));
      }
    }
    if (promise.routes.priced > 0 && promise.routes.review === 0) {
      findings.services.push(w("TREE_UNBOUNDED",
        `${slug} prices every answer path. Nothing sends an unusual job to review.`,
        { serviceSlug: slug, href: "/dashboard/services" }));
    }
  }

  // THE SAME-VISIT PROMISE, only if it can be kept.
  //
  // A WARNING, not a blocker: a contractor who only ever does one job per
  // visit has a working business and a working storefront, and refusing to
  // launch them would invent a requirement. What they should not have is
  // copy offering something the cart will refuse — so the storefront goes
  // quiet on its own (lib/sameVisit) and this says why, once, rather than
  // per service.
  const noAddOn = await servicesWithoutAddOnPrice(db, contractorId);
  const liveCount = await db.service.count({ where: { contractorId, active: true } });
  if (liveCount >= 2 && noAddOn.length === liveCount) {
    findings.services.push(w("SAME_VISIT_UNAVAILABLE",
      `None of your live services has an add-on price, so a homeowner can only ` +
      `book one thing per visit. We've taken the same-visit pricing promise off ` +
      `your storefront until at least one has one.`,
      { href: "/dashboard/services" }));
  } else if (noAddOn.length > 1) {
    findings.services.push(w("SAME_VISIT_PARTIAL",
      `${noAddOn.length} of your live services have no add-on price, including ` +
      `${noAddOn[0]}. Each can still be booked on its own, but two of them can't ` +
      `share a visit — so we don't offer one alongside another.`,
      { href: "/dashboard/services" }));
  }

  // ── 5. Scheduling ──────────────────────────────────────────────────────
  //
  // DECLARED, not inferred. Slice one read a Jobber connection as proof of
  // intent; a contractor can have a stale connection and schedule natively, or
  // intend to connect one and not have yet. Guessing either way is how
  // availability nobody verified reaches a homeowner.
  const mode = c.schedulingAuthority; // "NATIVE" | "EXTERNAL" | null
  const connection = await db.jobberConnection.findFirst({ where: { contractorId } });
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
      "You are using our default working hours and arrival windows. Confirm they match how you actually work.",
      { href: "/dashboard/business-hours" }));
  }
  if (!area || area.zipCodes.length === 0) {
    findings.scheduling.push(b("SERVICE_AREA_EMPTY", "No service area, so every address a homeowner enters would be refused.", { href: "/dashboard/service-area" }));
  }
  // Zero eligible crew is a CONFIGURATION FAILURE when an external provider is
  // authoritative, and legitimate when it is not. Availability must never fall
  // back to native windows and present capacity nobody verified.
  if (mode === null) {
    findings.scheduling.push(b("SCHEDULING_AUTHORITY_UNDECLARED",
      "Tell us who owns your calendar — Price2Book, or a system you already use. The answer changes what has to be true before anyone can book.",
      { href: IN_SETUP }));
  }
  if (mode === "EXTERNAL" && !connection) {
    findings.scheduling.push(b("PROVIDER_NOT_CONNECTED",
      "An external calendar is set as your source of truth, but none is connected.", { href: "/dashboard/jobber" }));
  }
  if (mode === "EXTERNAL" && crews === 0) {
    findings.scheduling.push(b("NO_ELIGIBLE_CREW",
      "Your external calendar decides availability, but no crew is marked bookable — so nothing can be scheduled.",
      { href: "/dashboard/jobber/crews" }));
  }
  // The native counterpart of NO_ELIGIBLE_CREW, and the reason that rule
  // could not simply be widened: what an external contractor owes is a roster
  // their provider knows about, and what a native contractor owes is a number.
  // BrightPath owed the number, was never asked for it, and so launched
  // offering arrival windows that checkout could not honor.
  if (mode === "NATIVE" && !((c.nativeConcurrentJobs ?? 0) > 0)) {
    findings.scheduling.push(b("NATIVE_CAPACITY_UNSET",
      "Price2Book decides your availability, but you haven't said how many jobs you can run at once — so we can't tell a homeowner which arrival windows are really open.",
      { href: IN_SETUP }));
  }
  if (mode === "NATIVE" && connection) {
    findings.scheduling.push(w("PROVIDER_CONNECTED_BUT_NATIVE",
      "You have an external calendar connected but Price2Book is set as your source of truth. Availability comes from Price2Book.",
      { href: IN_SETUP }));
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
        `${depositing.length} service(s) ask for a deposit, but Stripe is not connected.`,
        { href: "/dashboard/payments" }));
    } else if (!readiness.ready) {
      findings.payments.push(b("STRIPE_NOT_READY",
        `Stripe is connected but cannot take payments yet — ${readiness.reason}.`,
        { href: "/dashboard/payments" }));
    }
  }

  // ── 7. Launch ──────────────────────────────────────────────────────────
  if (intended.length === 0) {
    findings.launch.push(b("NOTHING_ACTIVATABLE",
      "Nothing is ready to sell yet. Choose the work you offer, then price it.", { href: IN_SETUP }));
  }
  for (const i of intended) {
    if (i.svc.requiresPreWorkVisit && ((i.svc.depositCents as number | null) ?? 0) === 0) {
      findings.launch.push(w("PRE_WORK_WITHOUT_DEPOSIT",
        `${i.svc.slug} needs a site visit before installation but takes no deposit.`,
        { serviceSlug: i.svc.slug as string, href: "/dashboard/services" }));
    }
  }
  if (intended.length === 1) {
    findings.launch.push(w("SINGLE_SERVICE_LAUNCH", "You are launching with one service. That works — worth a second look first.", { href: IN_SETUP }));
  }

  const TITLES: Record<StageKey, string> = {
    business: "Business", trade: "Trade & services", "pricing-foundation": "Pricing foundation",
    services: "Services & pricing", scheduling: "Scheduling", payments: "Payments",
    launch: "Review & launch",
  };
  const HREF: Partial<Record<StageKey, string>> = {
    "pricing-foundation": "/dashboard/pricing-settings", services: "/dashboard/services",
    scheduling: "/dashboard/business-hours",
    // Exists as of slice three. It pointed at a 404 before, so a "Fix" button
    // led nowhere.
    payments: "/dashboard/payments",
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
