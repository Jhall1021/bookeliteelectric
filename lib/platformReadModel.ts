/**
 * The platform read model — what Price2Book staff may KNOW about contractors.
 *
 * Phase 2 of Platform Admin. Read-only, by construction: nothing in this
 * module creates, updates or deletes, and the verifier holds that.
 *
 * TWO KINDS OF FACT, TWO DOORS
 *
 *   Directory facts     rows on platform models — Contractor, ContractorSite,
 *                       and the membership table that decides access. Read
 *                       inside `withPlatform`, on the unguarded client, once
 *                       the platform actor is resolved.
 *   Tenant-owned facts  services, quotes, bookings, onboarding, trades, the
 *                       calendar connection. Read ONLY inside
 *                       `withPlatformContractor`, on the GUARDED client, one
 *                       contractor at a time. Staff hold a key to the tenant
 *                       boundary, never a hole through it, so a cross-tenant
 *                       aggregate is a loop over authorized entries, not a
 *                       query with no tenant.
 *
 * ONE HEALTH ENGINE. Readiness comes from `assessOnboarding`, activation truth
 * from the same rules the contractor's own dashboard shows, payment readiness
 * from `connectReadiness`. This module renders those answers; it does not
 * compute its own. "Attention Needed" (`attentionFor`) is a strictly
 * actionable filter OVER them — the 29 August decision: a contractor appears
 * there only when a person at Price2Book should do something today.
 *
 * WHAT IT CANNOT SAY. There is no lifecycle column, so no "Trial / Active /
 * Suspended" — only the facts that exist: account enabled, setup progress,
 * live services, storefront state, scheduling authority, payment readiness.
 * There is no embed-detection authority, so "embed configured" is reported,
 * never "embed installed". Payment failures, invitation expiry and email
 * delivery have no data source yet and are absent rather than invented.
 *
 * Every entry point has a `...For(db, user, …)` form that takes identity as
 * an argument, so the verifier proves the decisions with a recording double,
 * and a request-bound form that reads the session and adds nothing.
 */

import type { PrismaClient, SchedulingAuthority } from "@prisma/client";
import { prisma } from "./prisma";
import { currentUser } from "./adminContext";
import {
  withPlatformFor, withPlatformContractorFor,
  type SignedInUser, type PlatformActor, type PlatformContractor,
} from "./platformContext";
import { assessOnboarding, type OnboardingReadiness } from "./onboardingReadiness";
import { connectReadiness, type Readiness } from "./stripeConnect";

/** A contractor as the directory sees it: platform-model facts only. */
export type ContractorRow = {
  id: string;
  slug: string;
  name: string;
  trade: string;
  active: boolean;
  createdAt: Date;
  countryCode: string | null;
  schedulingAuthority: SchedulingAuthority | null;
  site: { hostedSlug: string; active: boolean; embedOriginsConfigured: number } | null;
  /** Active OWNER emails — who to contact. Display only, never authorization. */
  owners: string[];
  payments: Readiness;
};

const STRIPE_SELECT = {
  stripeAccountId: true, stripeMerchantConfigured: true, stripeCardPaymentsStatus: true,
  stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
} as const;

/** Directory rows. `db` is the unguarded client handed out by withPlatform. */
export async function listContractors(db: PrismaClient): Promise<ContractorRow[]> {
  const rows = await db.contractor.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, name: true, trade: true, active: true, createdAt: true,
      countryCode: true, schedulingAuthority: true, ...STRIPE_SELECT,
      sites: { select: { hostedSlug: true, active: true, embedOrigins: true }, orderBy: { createdAt: "asc" }, take: 1 },
    },
  });
  // Membership is the access table, not tenant data; the contractor boundary
  // reads it the same way. Owners only, active only.
  const owners = await db.contractorMembership.findMany({
    where: { contractorId: { in: rows.map((r) => r.id) }, role: "OWNER", active: true },
    select: { contractorId: true, user: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, trade: r.trade, active: r.active, createdAt: r.createdAt,
    countryCode: r.countryCode, schedulingAuthority: r.schedulingAuthority,
    site: r.sites[0]
      ? { hostedSlug: r.sites[0].hostedSlug, active: r.sites[0].active, embedOriginsConfigured: r.sites[0].embedOrigins.length }
      : null,
    owners: owners.filter((o) => o.contractorId === r.id).map((o) => o.user.email),
    payments: connectReadiness(r),
  }));
}

/** Everything the Control Center shows about ONE contractor, all tenant-scoped. */
export type ContractorFacts = {
  contractor: PlatformContractor & {
    trade: string; active: boolean; createdAt: Date; countryCode: string | null;
    schedulingAuthority: SchedulingAuthority | null;
  };
  readiness: OnboardingReadiness;
  /** The same four-way split the contractor's own dashboard shows. */
  catalog: { total: number; live: number; priced: number; quoteOnly: number; needsPrice: number; hidden: number };
  quotesAwaiting: number;
  bookings: { total: number; last30Days: number };
  onboarding: { currentStage: string; completedAt: Date | null; updatedAt: Date } | null;
  trades: string[];
  calendar: { connected: boolean; expiresAt: Date | null };
  payments: Readiness;
  site: { hostedSlug: string; active: boolean; embedOriginsConfigured: number } | null;
  /** Who looked, for the page header. Never used to decide anything here. */
  actor: PlatformActor;
};

const DAY = 24 * 60 * 60 * 1000;

/**
 * Enter one contractor as staff and read its facts through the guard.
 * `contractorId` may be anything a request supplied — the wrapper authorizes
 * before it looks, and refuses before it reads.
 */
export async function contractorFactsFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown): Promise<ContractorFacts> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, actor, contractor) => {
    const QUOTE_ONLY = { bookingType: "REMOTE_QUOTE" as const };
    const since = new Date(Date.now() - 30 * DAY);
    const [row, readiness, priced, quoteOnly, needsPrice, hidden, quotesAwaiting, bookingsTotal, bookingsRecent, onboarding, trades, jobber] = await Promise.all([
      guarded.contractor.findUniqueOrThrow({
        where: { id: contractor.id },
        select: {
          trade: true, active: true, createdAt: true, countryCode: true, schedulingAuthority: true, ...STRIPE_SELECT,
          sites: { select: { hostedSlug: true, active: true, embedOrigins: true }, orderBy: { createdAt: "asc" }, take: 1 },
        },
      }),
      assessOnboarding(guarded, contractor.id),
      guarded.service.count({ where: { active: true, publishedPriceApprovedAt: { not: null } } }),
      guarded.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      guarded.service.count({ where: { active: true, publishedPriceApprovedAt: null, NOT: QUOTE_ONLY } }),
      guarded.service.count({ where: { active: false } }),
      guarded.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      guarded.booking.count(),
      guarded.booking.count({ where: { createdAt: { gte: since } } }),
      guarded.contractorOnboarding.findUnique({ where: { contractorId: contractor.id }, select: { currentStage: true, completedAt: true, updatedAt: true } }),
      guarded.contractorTrade.findMany({ where: { contractorId: contractor.id }, select: { tradeKey: true }, orderBy: { enrolledAt: "asc" } }),
      guarded.jobberConnection.findUnique({ where: { contractorId: contractor.id }, select: { expiresAt: true } }),
    ]);
    const live = priced + quoteOnly;
    return {
      contractor: { ...contractor, trade: row.trade, active: row.active, createdAt: row.createdAt, countryCode: row.countryCode, schedulingAuthority: row.schedulingAuthority },
      readiness,
      catalog: { total: live + needsPrice + hidden, live, priced, quoteOnly, needsPrice, hidden },
      quotesAwaiting,
      bookings: { total: bookingsTotal, last30Days: bookingsRecent },
      onboarding,
      trades: trades.map((t) => t.tradeKey),
      calendar: { connected: jobber !== null && jobber.expiresAt > new Date(), expiresAt: jobber?.expiresAt ?? null },
      payments: connectReadiness(row),
      site: row.sites[0] ? { hostedSlug: row.sites[0].hostedSlug, active: row.sites[0].active, embedOriginsConfigured: row.sites[0].embedOrigins.length } : null,
      actor,
    };
  });
}

/** One thing a person at Price2Book should do today, and where to go to do it. */
export type AttentionItem = {
  code: "LAUNCH_CHECK_FAILING" | "MATERIALS_BLOCK_LAUNCH" | "CALENDAR_DISCONNECTED" | "STUCK_IN_ONBOARDING";
  contractorId: string;
  slug: string;
  name: string;
  message: string;
  href: string;
};

/** Days without setup activity before an unfinished setup counts as stuck. */
export const STUCK_AFTER_DAYS = 14;

/**
 * The 29 August rule, as a pure function: strictly actionable, never a dump
 * of every warning. A contractor still working through setup is not a
 * problem; a contractor who FINISHED setup, or who has live services, and
 * whose launch check now fails, is. Inputs are the facts above; the findings
 * themselves come from assessOnboarding and are never recomputed here.
 */
export function attentionFor(f: ContractorFacts, now: Date = new Date()): AttentionItem[] {
  const out: AttentionItem[] = [];
  const href = `/platform/contractors/${f.contractor.id}`;
  const base = { contractorId: f.contractor.id, slug: f.contractor.slug, name: f.contractor.name, href };
  const pastSetup = f.onboarding?.completedAt !== null && f.onboarding?.completedAt !== undefined || f.catalog.live > 0;

  if (pastSetup && f.readiness.blockers.length > 0) {
    const material = f.readiness.blockers.filter((b) => /MATERIAL/.test(b.code));
    const other = f.readiness.blockers.filter((b) => !/MATERIAL/.test(b.code));
    if (material.length) out.push({ ...base, code: "MATERIALS_BLOCK_LAUNCH", message: `${material.length} material cost${material.length === 1 ? "" : "s"} unresolved on services meant to be live: ${material[0].message}` });
    if (other.length) out.push({ ...base, code: "LAUNCH_CHECK_FAILING", message: `${other.length} launch blocker${other.length === 1 ? "" : "s"}: ${other[0].message}` });
  }
  if (f.contractor.schedulingAuthority === "EXTERNAL" && !f.calendar.connected) {
    out.push({ ...base, code: "CALENDAR_DISCONNECTED", message: f.calendar.expiresAt ? `The external calendar connection expired ${f.calendar.expiresAt.toISOString().slice(0, 10)}; availability cannot be verified.` : "Scheduling is set to an external calendar and none is connected; availability cannot be shown." });
  }
  if (f.onboarding && f.onboarding.completedAt === null && f.catalog.live === 0) {
    const idleDays = Math.floor((now.getTime() - f.onboarding.updatedAt.getTime()) / DAY);
    if (idleDays >= STUCK_AFTER_DAYS) out.push({ ...base, code: "STUCK_IN_ONBOARDING", message: `No setup activity for ${idleDays} days; last stage was "${f.onboarding.currentStage}".` });
  }
  return out;
}

export type PlatformOverview = {
  contractors: { total: number; enabled: number; live: number; inSetup: number };
  services: { live: number };
  storefronts: { hosted: number; embedConfigured: number };
  quotesAwaiting: number;
  attention: AttentionItem[];
  rows: (ContractorRow & { live: number; canLaunch: boolean; blockers: number })[];
  actor: PlatformActor;
};

/**
 * The cross-tenant picture, built the only way it may be: authorize once,
 * list the directory on platform models, then enter each contractor through
 * its own guarded door for its own facts. Four contractors today; when that
 * is forty the answer is a cache, not a tenant-less query.
 */
export async function platformOverviewFor(db: PrismaClient, user: SignedInUser | null): Promise<PlatformOverview> {
  return withPlatformFor(db, user, async (platformDb, actor) => {
    const rows = await listContractors(platformDb);
    const facts = await Promise.all(rows.map((r) => contractorFactsFor(db, user, r.id)));
    const attention = facts.flatMap((f) => attentionFor(f));
    return {
      contractors: {
        total: rows.length,
        enabled: rows.filter((r) => r.active).length,
        live: facts.filter((f) => f.catalog.live > 0).length,
        inSetup: facts.filter((f) => f.onboarding && f.onboarding.completedAt === null && f.catalog.live === 0).length,
      },
      services: { live: facts.reduce((n, f) => n + f.catalog.live, 0) },
      storefronts: { hosted: rows.filter((r) => r.site?.active).length, embedConfigured: rows.filter((r) => (r.site?.embedOriginsConfigured ?? 0) > 0).length },
      quotesAwaiting: facts.reduce((n, f) => n + f.quotesAwaiting, 0),
      attention,
      rows: rows.map((r, i) => ({ ...r, live: facts[i].catalog.live, canLaunch: facts[i].readiness.canLaunch, blockers: facts[i].readiness.blockers.length })),
      actor,
    };
  });
}

// ── request-bound forms: read the session, add nothing ─────────────────────
export const platformOverview = async () => platformOverviewFor(prisma, await currentUser());
export const platformContractor = async (contractorId: unknown) => contractorFactsFor(prisma, await currentUser(), contractorId);
