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
import { partitionFixtures } from "./fixtureContractors";
import { mapWithConcurrency } from "./concurrency";

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
  /** The live storefront, if any — the one routing will serve. Retired sites are counted, not shown as current. */
  site: { hostedSlug: string; embedOriginsConfigured: number } | null;
  retiredSites: number;
  /** Active OWNER emails — who to contact. Display only, never authorization. */
  owners: string[];
  payments: Readiness;
};

/**
 * Storefront routing serves ACTIVE sites only and refuses inactive ones, so a
 * contractor's "storefront" is their active site — newest first if the schema
 * ever holds two — and a retired site is history, not the current answer.
 * Taking the oldest row regardless of `active` reported retired slugs as
 * current and undercounted live storefronts.
 */
const SITES_SELECT = {
  select: { hostedSlug: true, active: true, embedOrigins: true },
  orderBy: { createdAt: "desc" as const },
} as const;
type SiteRow = { hostedSlug: string; active: boolean; embedOrigins: string[] };
export function liveSite(sites: SiteRow[]): { site: { hostedSlug: string; embedOriginsConfigured: number } | null; retiredSites: number } {
  const live = sites.find((x) => x.active) ?? null;
  return {
    site: live ? { hostedSlug: live.hostedSlug, embedOriginsConfigured: live.embedOrigins.length } : null,
    retiredSites: sites.filter((x) => !x.active).length,
  };
}

const STRIPE_SELECT = {
  stripeAccountId: true, stripeMerchantConfigured: true, stripeCardPaymentsStatus: true,
  stripeOnboardingBlocked: true, stripeReadinessCheckedAt: true,
} as const;

/** Directory rows. `platformDb` is the platform-scoped client handed out by withPlatform. */
export async function listContractors(platformDb: PrismaClient): Promise<ContractorRow[]> {
  const rows = await platformDb.contractor.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true, slug: true, name: true, trade: true, active: true, createdAt: true,
      countryCode: true, schedulingAuthority: true, ...STRIPE_SELECT,
      sites: SITES_SELECT,
    },
  });
  // Membership is the access table, not tenant data; the contractor boundary
  // reads it the same way. Owners only, active only.
  const owners = await platformDb.contractorMembership.findMany({
    where: { contractorId: { in: rows.map((r) => r.id) }, role: "OWNER", active: true },
    select: { contractorId: true, user: { select: { email: true } } },
  });
  return rows.map((r) => ({
    id: r.id, slug: r.slug, name: r.name, trade: r.trade, active: r.active, createdAt: r.createdAt,
    countryCode: r.countryCode, schedulingAuthority: r.schedulingAuthority,
    ...liveSite(r.sites),
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
  /**
   * Connected means a JobberConnection row exists — the meaning the readiness
   * engine and the contractor's dashboard already use. Access tokens expire
   * hourly and are refreshed on use by getValidJobberAccessToken, so token
   * expiry is NOT disconnection; it is reported only as what it is.
   */
  calendar: { connected: boolean; connectedAt: Date | null; accessTokenExpired: boolean };
  payments: Readiness;
  site: { hostedSlug: string; embedOriginsConfigured: number } | null;
  retiredSites: number;
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
          sites: SITES_SELECT,
        },
      }),
      assessOnboarding(guarded, contractor.id),
      // DISJOINT by construction: quote-only is decided first, then priced and
      // needs-a-price split the rest. The schema permits a REMOTE_QUOTE service
      // to carry an approved price, and counting it in both columns made
      // "live" and "total" overstate by one per such service. (The contractor
      // dashboard's own split has the same overlap and is not changed here.)
      guarded.service.count({ where: { active: true, NOT: QUOTE_ONLY, publishedPriceApprovedAt: { not: null } } }),
      guarded.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      guarded.service.count({ where: { active: true, NOT: QUOTE_ONLY, publishedPriceApprovedAt: null } }),
      guarded.service.count({ where: { active: false } }),
      guarded.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      guarded.booking.count(),
      guarded.booking.count({ where: { createdAt: { gte: since } } }),
      guarded.contractorOnboarding.findUnique({ where: { contractorId: contractor.id }, select: { currentStage: true, completedAt: true, updatedAt: true } }),
      guarded.contractorTrade.findMany({ where: { contractorId: contractor.id }, select: { tradeKey: true }, orderBy: { enrolledAt: "asc" } }),
      guarded.jobberConnection.findUnique({ where: { contractorId: contractor.id }, select: { connectedAt: true, expiresAt: true } }),
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
      calendar: { connected: jobber !== null, connectedAt: jobber?.connectedAt ?? null, accessTokenExpired: jobber !== null && jobber.expiresAt <= new Date() },
      payments: connectReadiness(row),
      ...liveSite(row.sites),
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
  // A RETIRED contractor — `active` false, set only by the platform's retire
  // command — has nothing a person should do today: its storefront and
  // services are down on purpose, so a failing launch check or an idle setup
  // is the expected state, not a problem.
  if (!f.contractor.active) return out;
  const href = `/platform/contractors/${f.contractor.id}`;
  const base = { contractorId: f.contractor.id, slug: f.contractor.slug, name: f.contractor.name, href };
  const pastSetup = f.onboarding?.completedAt !== null && f.onboarding?.completedAt !== undefined || f.catalog.live > 0;

  if (pastSetup && f.readiness.blockers.length > 0) {
    const material = f.readiness.blockers.filter((b) => /MATERIAL/.test(b.code));
    const other = f.readiness.blockers.filter((b) => !/MATERIAL/.test(b.code));
    if (material.length) out.push({ ...base, code: "MATERIALS_BLOCK_LAUNCH", message: `${material.length} material cost${material.length === 1 ? "" : "s"} unresolved on services meant to be live: ${material[0].message}` });
    if (other.length) out.push({ ...base, code: "LAUNCH_CHECK_FAILING", message: `${other.length} launch blocker${other.length === 1 ? "" : "s"}: ${other[0].message}` });
  }
  // Presence of the connection, never token age: an hourly access-token
  // expiry is routine and refreshed on use, and calling it a disconnection
  // would page a person for nothing.
  if (f.contractor.schedulingAuthority === "EXTERNAL" && !f.calendar.connected) {
    out.push({ ...base, code: "CALENDAR_DISCONNECTED", message: "Scheduling is set to an external calendar and none is connected; availability cannot be shown." });
  }
  if (f.onboarding && f.onboarding.completedAt === null && f.catalog.live === 0) {
    const idleDays = Math.floor((now.getTime() - f.onboarding.updatedAt.getTime()) / DAY);
    if (idleDays >= STUCK_AFTER_DAYS) out.push({ ...base, code: "STUCK_IN_ONBOARDING", message: `No setup activity for ${idleDays} days; last stage was "${f.onboarding.currentStage}".` });
  }
  return out;
}

/** A directory row plus what its own boundary said — or why it could not be read. */
export type OverviewRow = ContractorRow & (
  | { readable: true; live: number; canLaunch: boolean; blockers: number }
  | { readable: false; error: string }
);

/**
 * What the Attention page may CLAIM when it has nothing to list. "Nothing"
 * is only true for contractors that were actually read; an unreadable one
 * has not been shown healthy, and the empty state must say so. Pure, so the
 * verifier holds the wording to the facts.
 */
export function attentionSummary(attention: AttentionItem[], unreadable: { name: string }[]): { tone: "clear" | "partial" | "items"; message: string } {
  if (attention.length > 0) return { tone: "items", message: `${attention.length} thing${attention.length === 1 ? "" : "s"} need${attention.length === 1 ? "s" : ""} a person today.` };
  if (unreadable.length > 0) return { tone: "partial", message: `Nothing identified among readable contractors. ${unreadable.length} contractor${unreadable.length === 1 ? " was" : "s were"} not readable this time (${unreadable.map((u) => u.name).join(", ")}), so nothing is known about ${unreadable.length === 1 ? "it" : "them"}.` };
  return { tone: "clear", message: "Nothing. Every contractor past setup passes its launch check, external calendars are connected, and nobody is stuck." };
}

export type PlatformOverview = {
  contractors: { total: number; enabled: number; live: number; inSetup: number; unreadable: number };
  services: { live: number };
  storefronts: { hosted: number; embedConfigured: number };
  quotesAwaiting: number;
  attention: AttentionItem[];
  rows: OverviewRow[];
  /** Contractors whose facts could not be read this time, with the reason. Shown, never hidden. */
  unreadable: { contractorId: string; slug: string; name: string; error: string }[];
  /**
   * Verifier fixtures left out of every figure above (lib/fixtureContractors),
   * so staff never mistake a probe for a business. 0 when the caller asked
   * to see them, which only a verifier inspecting its own probe does.
   */
  fixtures: { hidden: number };
  actor: PlatformActor;
};

export type ReadFacts = (db: PrismaClient, user: SignedInUser | null, contractorId: string) => Promise<ContractorFacts>;

/** How many contractors are entered at once. Small on purpose: each entry is several queries. */
export const OVERVIEW_CONCURRENCY = 3;

/** Re-exported from lib/concurrency.ts — see that file for why it isn't defined here. */
export { mapWithConcurrency };

/**
 * The cross-tenant picture, built the only way it may be: authorize once,
 * list the directory on platform models, then enter each contractor through
 * its own guarded door for its own facts. Four contractors today; when that
 * is forty the answer is a cache, not a tenant-less query.
 */
/**
 * One unreadable contractor must not take the overview down — that is the
 * moment staff most need the other rows. Each entry is isolated: a throw
 * becomes an explicit "unreadable" row with its reason, and the sums cover
 * the rows that were read. Entries run a few at a time, not all at once.
 * `readFacts` is injectable so the verifier can prove both properties.
 *
 * Verifier fixtures are left out unless `fixtures: "show"` is passed. The
 * request-bound form below passes nothing, so a page cannot see one; a
 * verifier inspecting its own probe asks for them explicitly.
 */
export async function platformOverviewFor(
  db: PrismaClient, user: SignedInUser | null,
  opts: { readFacts?: ReadFacts; concurrency?: number; fixtures?: "hide" | "show" } = {},
): Promise<PlatformOverview> {
  const readFacts = opts.readFacts ?? contractorFactsFor;
  return withPlatformFor(db, user, async (platformDb, actor) => {
    const directory = await listContractors(platformDb);
    const split = partitionFixtures(directory);
    const rows = opts.fixtures === "show" ? directory : split.genuine;
    const results = await mapWithConcurrency(rows, opts.concurrency ?? OVERVIEW_CONCURRENCY, async (r) => {
      try { return { ok: true as const, facts: await readFacts(db, user, r.id) }; }
      catch (e) { return { ok: false as const, error: (e as Error).message || String(e) }; }
    });
    const facts = results.flatMap((x) => (x.ok ? [x.facts] : []));
    const unreadable = rows.flatMap((r, i) => (results[i].ok ? [] : [{ contractorId: r.id, slug: r.slug, name: r.name, error: (results[i] as { error: string }).error }]));
    return {
      contractors: {
        total: rows.length,
        enabled: rows.filter((r) => r.active).length,
        live: facts.filter((f) => f.catalog.live > 0).length,
        inSetup: facts.filter((f) => f.onboarding && f.onboarding.completedAt === null && f.catalog.live === 0).length,
        unreadable: unreadable.length,
      },
      services: { live: facts.reduce((n, f) => n + f.catalog.live, 0) },
      storefronts: { hosted: rows.filter((r) => r.site !== null).length, embedConfigured: rows.filter((r) => (r.site?.embedOriginsConfigured ?? 0) > 0).length },
      quotesAwaiting: facts.reduce((n, f) => n + f.quotesAwaiting, 0),
      attention: facts.flatMap((f) => attentionFor(f)),
      rows: rows.map((r, i) => {
        const x = results[i];
        return x.ok
          ? { ...r, readable: true as const, live: x.facts.catalog.live, canLaunch: x.facts.readiness.canLaunch, blockers: x.facts.readiness.blockers.length }
          : { ...r, readable: false as const, error: x.error };
      }),
      unreadable,
      fixtures: { hidden: opts.fixtures === "show" ? 0 : split.fixtures.length },
      actor,
    };
  });
}

// ── request-bound forms: read the session, add nothing ─────────────────────
export const platformOverview = async () => platformOverviewFor(prisma, await currentUser());
export const platformContractor = async (contractorId: unknown) => contractorFactsFor(prisma, await currentUser(), contractorId);
