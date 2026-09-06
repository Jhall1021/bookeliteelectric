/**
 * Platform read model — staff may know, never touch, and only through the door.
 *
 *   npx tsx scripts/verify-platform-read-model.ts
 *
 * PRODUCTION-SAFE. Writes no PlatformAccess row (staff identities are answered
 * by a recording double, as in verify-platform-authority); its only rows are a
 * run-unique throwaway contractor, an owner user with a membership on it, and
 * their removal. Cross-tenant probes use the first REAL contractor with
 * services as the foreign tenant, read only.
 *
 * WHAT IS PROVEN
 *   1. Refusals come first: signed-out and a contractor OWNER without a grant
 *      get nothing from the overview or a contractor's facts.
 *   2. Tenant facts are read INSIDE the guard: the throwaway's facts contain
 *      only its own catalog (zero services), never the foreign tenant's, and
 *      the entry is marked platform-session.
 *   3. attentionFor is strictly actionable, case by case, and invents no rule
 *      the readiness engine did not already state.
 *   4. Structure: the read model and every platform surface write nothing,
 *      read PlatformAccess nowhere, authorize by no email, and take a
 *      request-supplied contractor id in exactly one file.
 */
import { PrismaClient, type PlatformRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";
import { destroyContractor } from "./_throwaway";
import { currentTenantOrNull } from "../lib/tenantContext";
import {
  listContractors, contractorFactsFor, platformOverviewFor, attentionFor, STUCK_AFTER_DAYS, type ContractorFacts,
} from "../lib/platformReadModel";
import { withPlatformFor } from "../lib/platformContext";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-platform-read-model";
const SLUG = `${SLUG_PREFIX}-${RUN}`;
const USER_PREFIX = "test-platform-read-model";
const EMAIL_PREFIX = "p2b-verify-platform-rm-";
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (f: string) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
async function throwsWith(run: () => Promise<unknown>) { try { await run(); return null; } catch (e) { return (e as Error).name; } }

type Grant = { role: PlatformRole; grantedAt: Date; revokedAt: Date | null };
function doubleWith(grants: Record<string, Grant>): PrismaClient {
  const platformAccess = { findUnique: async (a: { where: { userId?: string } }) => grants[a.where.userId ?? ""] ?? null };
  return new Proxy(raw, { get(t, p) { return p === "platformAccess" ? platformAccess : Reflect.get(t, p); } }) as unknown as PrismaClient;
}

async function teardown() {
  await raw.contractorMembership.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await raw.contractorSite.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await destroyContractor(raw, SLUG).catch(() => {});
  await raw.user.deleteMany({ where: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } } }).catch(() => {});
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({ where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: SLUG }, createdAt: { lt: cutoff } }, select: { slug: true } });
  for (const c of stale) {
    await raw.contractorMembership.deleteMany({ where: { contractor: { slug: c.slug } } }).catch(() => {});
    await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug: c.slug } } }).catch(() => {});
    await raw.contractorSite.deleteMany({ where: { contractor: { slug: c.slug } } }).catch(() => {});
    await destroyContractor(raw, c.slug).catch(() => {});
  }
  await raw.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX }, createdAt: { lt: cutoff } } }).catch(() => {});
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

function facts(over: Partial<ContractorFacts> & { blockers?: { code: string; message: string }[] }): ContractorFacts {
  const now = new Date();
  const blockers = (over.blockers ?? []).map((b) => ({ ...b, severity: "blocker" as const }));
  return {
    contractor: { id: "c1", slug: "probe", name: "Probe", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "NATIVE", ...(over.contractor ?? {}) },
    readiness: { stages: [], blockers, warnings: [], canLaunch: blockers.length === 0, intended: [], notes: [] },
    catalog: { total: 0, live: 0, priced: 0, quoteOnly: 0, needsPrice: 0, hidden: 0, ...(over.catalog ?? {}) },
    quotesAwaiting: 0,
    bookings: { total: 0, last30Days: 0 },
    onboarding: over.onboarding === undefined ? { currentStage: "services", completedAt: null, updatedAt: now } : over.onboarding,
    trades: ["electrical"],
    calendar: over.calendar ?? { connected: false, expiresAt: null },
    payments: { ready: false, reason: "no Stripe account is connected" },
    site: null,
    actor: { userId: "staff", role: "PLATFORM_ADMIN", grantedAt: now, email: "staff@invalid.test" },
  };
}

async function main() {
  console.log(`\nPLATFORM READ MODEL — staff may know, never touch, only through the door\n`);
  await teardown();
  await sweepStale();

  const t0 = new Date();
  const staff = { id: `${USER_PREFIX}-${RUN}-staff`, email: `${EMAIL_PREFIX}${RUN}-staff@invalid.test` };
  const db = doubleWith({ [staff.id]: { role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: null } });

  const probe = await raw.contractor.create({ data: { slug: SLUG, name: "Read model probe", trade: "electrical", active: true, schedulingAuthority: "EXTERNAL" }, select: { id: true } });
  const owner = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-owner`, email: `${EMAIL_PREFIX}${RUN}-owner@invalid.test`, name: "Probe owner", emailVerified: true }, select: { id: true, email: true } });
  await raw.contractorMembership.create({ data: { userId: owner.id, contractorId: probe.id, role: "OWNER" } });
  const foreign = await raw.contractor.findFirstOrThrow({ where: { services: { some: {} }, NOT: { slug: SLUG } }, select: { id: true, slug: true } });
  const foreignServices = await raw.service.count({ where: { contractorId: foreign.id } });

  // ── 1. refusals first ─────────────────────────────────────────────────
  ok(`1. signed out gets no overview`, (await throwsWith(() => platformOverviewFor(db, null))) === "NotAuthenticatedError");
  ok(`   signed out gets no contractor's facts`, (await throwsWith(() => contractorFactsFor(db, null, probe.id))) === "NotAuthenticatedError");
  ok(`   an OWNER without a grant gets no overview`, (await throwsWith(() => platformOverviewFor(db, owner))) === "NotPlatformStaffError");
  ok(`   nor the facts of the contractor they own`, (await throwsWith(() => contractorFactsFor(db, owner, probe.id))) === "NotPlatformStaffError");
  ok(`   nor anyone else's`, (await throwsWith(() => contractorFactsFor(db, owner, foreign.id))) === "NotPlatformStaffError");

  // ── 2. directory on platform models, facts inside the guard ──────────
  const rows = await withPlatformFor(db, staff, async (pdb) => listContractors(pdb));
  const mine = rows.find((r) => r.id === probe.id);
  ok(`2. the directory lists the probe with its owner and no lifecycle it cannot know`, !!mine && mine.owners.includes(owner.email) && !("lifecycle" in (mine as object)) && !("status" in (mine as object)));
  ok(`   and reads payments through connectReadiness, not its own rule`, !!mine && mine.payments.ready === false && /Stripe/.test(mine.payments.reason));

  const f = await contractorFactsFor(db, staff, probe.id);
  ok(`   staff read the probe's facts through the platform boundary`, f.contractor.slug === SLUG && f.actor.userId === staff.id);
  ok(`   the probe sees only its own catalog: zero services, not the foreign tenant's ${foreignServices}`, f.catalog.total === 0 && f.catalog.live === 0);
  ok(`   the readiness engine's answer is the one shown, not a recomputation`, Array.isArray(f.readiness.stages) && f.readiness.stages.length > 0 && typeof f.readiness.canLaunch === "boolean");
  ok(`   staff may enter the foreign tenant too, and see its real catalog there`, (await contractorFactsFor(db, staff, foreign.id)).catalog.total === foreignServices);
  ok(`   a made-up id is not found, after authorization`, (await throwsWith(() => contractorFactsFor(db, staff, "no-such-contractor"))) === "PlatformContractorNotFoundError");
  let tenant: unknown = "unset";
  const { withPlatformContractorFor } = await import("../lib/platformContext");
  await withPlatformContractorFor(db, staff, probe.id, async () => { tenant = currentTenantOrNull(); });
  ok(`   and the entry is a platform-session tenant scope`, (tenant as { source?: string; contractorId?: string } | null)?.source === "platform-session" && (tenant as { contractorId?: string }).contractorId === probe.id);
  const overview = await platformOverviewFor(db, staff);
  ok(`   the overview is a sum over entered tenants and includes the probe`, overview.rows.some((r) => r.id === probe.id) && overview.contractors.total === rows.length && overview.services.live >= 0);
  ok(`   whose attention list names it for the calendar it lacks`, overview.attention.some((a) => a.contractorId === probe.id && a.code === "CALENDAR_DISCONNECTED"));

  // ── 3. attention is strictly actionable ──────────────────────────────
  const now = new Date();
  const codes = (x: ContractorFacts) => attentionFor(x, now).map((a) => a.code).sort().join("+") || "none";
  ok(`3. a contractor mid-setup with blockers is NOT attention`, codes(facts({ blockers: [{ code: "PRICE_NOT_APPROVED", message: "x" }], contractor: { id: "a", slug: "a", name: "A", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "NATIVE" } })) === "none");
  ok(`   finished setup with a non-material blocker is LAUNCH_CHECK_FAILING`, codes(facts({ blockers: [{ code: "PRICE_NOT_APPROVED", message: "x" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "LAUNCH_CHECK_FAILING");
  ok(`   live services with a material blocker is MATERIALS_BLOCK_LAUNCH`, codes(facts({ blockers: [{ code: "MATERIALS_UNRESOLVED", message: "x" }], catalog: { total: 3, live: 2, priced: 2, quoteOnly: 0, needsPrice: 1, hidden: 0 } })) === "MATERIALS_BLOCK_LAUNCH");
  ok(`   both kinds report as two items, not one blur`, codes(facts({ blockers: [{ code: "MATERIALS_UNRESOLVED", message: "x" }, { code: "COUNTRY_MISSING", message: "y" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "LAUNCH_CHECK_FAILING+MATERIALS_BLOCK_LAUNCH");
  ok(`   an external calendar that is not connected is CALENDAR_DISCONNECTED`, codes(facts({ contractor: { id: "b", slug: "b", name: "B", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "EXTERNAL" } })) === "CALENDAR_DISCONNECTED");
  ok(`   a native scheduler with no calendar is not`, codes(facts({})) === "none");
  const old = new Date(now.getTime() - (STUCK_AFTER_DAYS + 1) * 86400000);
  ok(`   ${STUCK_AFTER_DAYS + 1} idle days in setup is STUCK_IN_ONBOARDING`, codes(facts({ onboarding: { currentStage: "pricing-foundation", completedAt: null, updatedAt: old } })) === "STUCK_IN_ONBOARDING");
  ok(`   but not once services are live`, codes(facts({ onboarding: { currentStage: "launch", completedAt: null, updatedAt: old }, catalog: { total: 1, live: 1, priced: 1, quoteOnly: 0, needsPrice: 0, hidden: 0 } })) === "none");
  ok(`   a live contractor with no blockers is nothing to do`, codes(facts({ catalog: { total: 5, live: 5, priced: 5, quoteOnly: 0, needsPrice: 0, hidden: 0 }, onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "none");
  ok(`   every item points at the contractor's control center`, attentionFor(facts({ blockers: [{ code: "X", message: "x" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } }), now).every((a) => a.href === "/platform/contractors/c1"));

  // ── 4. structure ─────────────────────────────────────────────────────
  const rm = strip("lib/platformReadModel.ts");
  const surfaces = sourceFiles(["app/platform", "components/platform"]);
  // Method CALLS only — `.createdAt` is a column, not a write.
  const WRITES = /\.(create|update|upsert|delete|createMany|updateMany|deleteMany|\$executeRaw(Unsafe)?|\$queryRaw(Unsafe)?)\(/;
  ok(`4. the read model writes nothing`, !WRITES.test(rm));
  ok(`   nor does any platform surface`, surfaces.every((f) => !WRITES.test(strip(f))), surfaces.filter((f) => WRITES.test(strip(f))).join(", "));
  ok(`   tenant facts are read only inside withPlatformContractorFor`, /withPlatformContractorFor\(db, user, contractorId, async \(guarded/.test(rm) && !/prisma\.(service|quote|booking|contractorOnboarding|contractorTrade|jobberConnection)/.test(rm));
  ok(`   the directory reads platform models only, inside withPlatform`, /withPlatformFor\(db, user/.test(rm) && !/platformDb\.(service|quote|booking)|pdb\.(service|quote|booking)/.test(rm));
  ok(`   readiness is assessOnboarding's, payments connectReadiness's — no second engine`, /assessOnboarding\(guarded/.test(rm) && /connectReadiness\(/.test(rm) && !/canLaunch:\s*(true|false|!?[\w.]*blockers)/.test(rm) && !/stripeCardPaymentsStatus\s*[!=]==/.test(rm));
  ok(`   the read model never reads PlatformAccess or a membership to decide anything`, !/platformAccess/.test(rm) && !/\.email\s*[!=]==?/.test(rm));
  ok(`   platform surfaces import no raw client and no contractor boundary`, surfaces.every((f) => !/from "@\/lib\/prisma"|adminContext|new PrismaClient|platformDb/.test(strip(f))));
  const cc = strip("app/platform/contractors/[contractorId]/page.tsx");
  ok(`   the Control Center is the one file that takes a request-supplied id, and hands it straight to the boundary`,
    /platformContractor\(params\.contractorId\)/.test(cc) && surfaces.filter((f) => /params\.contractorId|searchParams/.test(strip(f))).length === 1);
  ok(`   it 404s an unknown contractor and shows a "read-only" mark`, /PlatformContractorNotFoundError/.test(cc) && /notFound\(\)/.test(cc) && /read-only/.test(cc));
  const layout = strip("app/platform/layout.tsx");
  ok(`   the shell links the three views and still gates on the actor`, /\/platform\/contractors/.test(layout) && /\/platform\/attention/.test(layout) && /resolvePlatformActor\(\)/.test(layout));
  ok(`   no lifecycle, status or billing is invented anywhere`, [rm, ...surfaces.map(strip)].every((s) => !/TRIAL|PAST_DUE|SUSPENDED|CANCELED|lifecycle:|stripeCustomerId|subscription/.test(s)));
  ok(`   "embed installed" is never claimed`, !/installed/.test(rm) && surfaces.every((f) => !/embed (is )?installed|installed the embed/i.test(strip(f))));

  await teardown();
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Staff may know. They cannot touch. And they enter through the same door every time.\n`);
  await raw.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown(); await raw.$disconnect(); process.exit(1); });
