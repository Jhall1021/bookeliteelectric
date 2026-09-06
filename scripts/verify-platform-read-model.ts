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
import { importViolations, requestAccess, mutatingCalls, memberAccessesOn, callsTo, paramsUses, usesOf, prismaRelations, relationTraversals, callsResolved, assignmentsTo, parameterOf, callbackParams, type Policy } from "./_platformSurfaceAudit";
import { TENANT_SCOPED_MODELS, DERIVED_TENANT_MODELS } from "../lib/tenantGuard";

/**
 * IMPORT POLICY — the structural promise, enforced by syntax tree.
 *
 * Every Platform Admin file is held to an allowlist of modules AND symbols,
 * judged from the AST by scripts/_platformSurfaceAudit.ts: a binding is
 * followed to the export it came from whatever it is called locally, bare
 * imports and runtime re-exports are refused, dynamic import() and require()
 * are refused, and type-only edges are exempt because they cannot run.
 */
const SURFACE_POLICY: Policy = {
  "next/link": ["default"],
  "next/navigation": ["redirect", "notFound"],
  "@/lib/platformContext": ["NotAuthenticatedError", "NotPlatformStaffError", "PlatformContractorNotFoundError", "resolvePlatformActor", "withPlatformRoute"],
  "@/lib/platformReadModel": ["platformOverview", "platformContractor", "attentionFor", "attentionSummary", "STUCK_AFTER_DAYS"],
  "@/components/platform/ContractorTable": ["ContractorTable"],
};
const READ_MODEL_POLICY: Policy = {
  "./prisma": ["prisma"],
  "./adminContext": ["currentUser"],
  "./platformContext": ["withPlatformFor", "withPlatformContractorFor"],
  "./onboardingReadiness": ["assessOnboarding"],
  "./stripeConnect": ["connectReadiness"],
};

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
  await raw.jobberConnection.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
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
    await raw.jobberConnection.deleteMany({ where: { contractor: { slug: c.slug } } }).catch(() => {});
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
    calendar: over.calendar ?? { connected: false, connectedAt: null, accessTokenExpired: false },
    payments: { ready: false, reason: "no Stripe account is connected" },
    site: null,
    retiredSites: 0,
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
  // Finding 2: an older RETIRED site and a newer LIVE one. The live one is the storefront.
  await raw.contractorSite.create({ data: { contractorId: probe.id, hostedSlug: `${SLUG}-old`, publicId: `site_${RUN.padEnd(32, "0").slice(0, 32)}`, active: false, embedOrigins: ["https://old.example"], createdAt: new Date(Date.now() - 2 * 86400000) } });
  await raw.contractorSite.create({ data: { contractorId: probe.id, hostedSlug: SLUG, publicId: `site_${("n" + RUN).padEnd(32, "0").slice(0, 32)}`, active: true, embedOrigins: ["https://a.example", "https://b.example"] } });
  // Finding 1: a real calendar connection whose ACCESS token has expired — routine, refreshed on use, not a disconnection.
  await raw.jobberConnection.create({ data: { contractorId: probe.id, accessToken: "expired-probe-token", refreshToken: "probe-refresh", expiresAt: new Date(Date.now() - 3600000), connectedAt: new Date(Date.now() - 30 * 86400000) } });
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
  // Finding 1 (review): the probe HAS a calendar connection; its access token merely expired.
  ok(`   a connection with an expired access token is CONNECTED, and says the token is due its routine refresh`, f.calendar.connected && f.calendar.accessTokenExpired && f.calendar.connectedAt !== null);
  ok(`   so an EXTERNAL scheduler with a connected calendar is NOT calendar-disconnected`, !overview.attention.some((a) => a.contractorId === probe.id && a.code === "CALENDAR_DISCONNECTED"));
  // Finding 2 (review): the live site is the newer active one; the retired one is counted, not shown.
  ok(`   the storefront is the LIVE site, not the oldest row`, f.site?.hostedSlug === SLUG && f.site.embedOriginsConfigured === 2 && f.retiredSites === 1);
  ok(`   and the directory agrees, and counts it among live storefronts`, mine?.site?.hostedSlug === SLUG && mine.retiredSites === 1 && overview.storefronts.hosted >= 1 && overview.rows.some((r) => r.id === probe.id && r.site?.hostedSlug === SLUG));
  // Finding 3 (review): one unreadable contractor does not take the overview down.
  const { platformOverviewFor: overviewFor, OVERVIEW_CONCURRENCY } = await import("../lib/platformReadModel");
  const boom = async (d: PrismaClient, u: typeof staff | null, id: string) => { if (id === probe.id) throw new Error("injected: probe unreadable"); return contractorFactsFor(d, u, id); };
  const partial = await overviewFor(db, staff, { readFacts: boom });
  // Judged against the overview's OWN listing: the shared database gains and
  // loses other sessions' throwaway contractors between calls, so "exactly
  // one unreadable" would race. What must hold is that the probe is the
  // explicit unreadable row with the injected reason, that readable rows
  // still exist, and that the counts agree with the rows.
  const probeRow = partial.rows.find((r) => r.id === probe.id);
  ok(`   an unreadable contractor becomes an explicit row with its reason, and the others still read`,
    !!probeRow && probeRow.readable === false && /injected/.test((probeRow as { error: string }).error)
      && partial.rows.some((r) => r.readable) && partial.unreadable.some((u) => u.contractorId === probe.id)
      && partial.contractors.unreadable === partial.unreadable.length && partial.contractors.unreadable === partial.rows.filter((r) => !r.readable).length,
    `readable=${partial.rows.filter((r) => r.readable).length} unreadable=${partial.unreadable.map((u) => `${u.slug}:${u.error.slice(0, 40)}`).join("|")}`);
  ok(`   and the sums cover the rows that were read, not the whole directory`,
    partial.contractors.total === partial.rows.length && !partial.attention.some((a) => a.contractorId === probe.id)
      && partial.contractors.live + partial.contractors.inSetup <= partial.rows.filter((r) => r.readable).length);
  let inFlight = 0, peak = 0;
  const counting = async (d: PrismaClient, u: typeof staff | null, id: string) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 40)); inFlight--; return contractorFactsFor(d, u, id); };
  await overviewFor(db, staff, { readFacts: counting, concurrency: 2 });
  ok(`   entries are bounded: ${rows.length} contractors, at most 2 in flight when asked for 2 (peak ${peak})`, peak <= 2 && rows.length >= 3);
  ok(`   and the default bound is small`, OVERVIEW_CONCURRENCY <= 3);

  // ── 3. attention is strictly actionable ──────────────────────────────
  const now = new Date();
  const codes = (x: ContractorFacts) => attentionFor(x, now).map((a) => a.code).sort().join("+") || "none";
  ok(`3. a contractor mid-setup with blockers is NOT attention`, codes(facts({ blockers: [{ code: "PRICE_NOT_APPROVED", message: "x" }], contractor: { id: "a", slug: "a", name: "A", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "NATIVE" } })) === "none");
  ok(`   finished setup with a non-material blocker is LAUNCH_CHECK_FAILING`, codes(facts({ blockers: [{ code: "PRICE_NOT_APPROVED", message: "x" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "LAUNCH_CHECK_FAILING");
  ok(`   live services with a material blocker is MATERIALS_BLOCK_LAUNCH`, codes(facts({ blockers: [{ code: "MATERIALS_UNRESOLVED", message: "x" }], catalog: { total: 3, live: 2, priced: 2, quoteOnly: 0, needsPrice: 1, hidden: 0 } })) === "MATERIALS_BLOCK_LAUNCH");
  ok(`   both kinds report as two items, not one blur`, codes(facts({ blockers: [{ code: "MATERIALS_UNRESOLVED", message: "x" }, { code: "COUNTRY_MISSING", message: "y" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "LAUNCH_CHECK_FAILING+MATERIALS_BLOCK_LAUNCH");
  ok(`   an external calendar that is not connected is CALENDAR_DISCONNECTED`, codes(facts({ contractor: { id: "b", slug: "b", name: "B", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "EXTERNAL" } })) === "CALENDAR_DISCONNECTED");
  ok(`   a native scheduler with no calendar is not`, codes(facts({})) === "none");
  ok(`   an EXTERNAL scheduler whose access token merely expired is not (review finding 1)`, codes(facts({ contractor: { id: "b", slug: "b", name: "B", trade: "electrical", active: true, createdAt: now, countryCode: "US", schedulingAuthority: "EXTERNAL" }, calendar: { connected: true, connectedAt: now, accessTokenExpired: true } })) === "none");
  const old = new Date(now.getTime() - (STUCK_AFTER_DAYS + 1) * 86400000);
  ok(`   ${STUCK_AFTER_DAYS + 1} idle days in setup is STUCK_IN_ONBOARDING`, codes(facts({ onboarding: { currentStage: "pricing-foundation", completedAt: null, updatedAt: old } })) === "STUCK_IN_ONBOARDING");
  ok(`   but not once services are live`, codes(facts({ onboarding: { currentStage: "launch", completedAt: null, updatedAt: old }, catalog: { total: 1, live: 1, priced: 1, quoteOnly: 0, needsPrice: 0, hidden: 0 } })) === "none");
  ok(`   a live contractor with no blockers is nothing to do`, codes(facts({ catalog: { total: 5, live: 5, priced: 5, quoteOnly: 0, needsPrice: 0, hidden: 0 }, onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } })) === "none");
  ok(`   every item points at the contractor's control center`, attentionFor(facts({ blockers: [{ code: "X", message: "x" }], onboarding: { currentStage: "launch", completedAt: now, updatedAt: now } }), now).every((a) => a.href === "/platform/contractors/c1"));

  // ── 4. structure, by syntax tree ─────────────────────────────────────
  const rm = strip("lib/platformReadModel.ts");
  const cc = strip("app/platform/contractors/[contractorId]/page.tsx");
  const rmSrc = readFileSync("lib/platformReadModel.ts", "utf8");
  const surfaces = sourceFiles(["app/platform", "app/api/platform", "components/platform"]);
  const rmWrites = mutatingCalls(rmSrc, "lib/platformReadModel.ts");
  ok(`4. the read model makes no mutating call, on any receiver`, rmWrites.length === 0, rmWrites.map((w) => `${w.callee}@${w.line}`).join(", "));
  const surfaceWrites = surfaces.flatMap((f) => mutatingCalls(readFileSync(f, "utf8"), f).map((w) => `${f}:${w.line} ${w.callee}`));
  ok(`   nor does any platform surface`, surfaceWrites.length === 0, surfaceWrites.join(", "));
  // Tenant models are never touched through the unguarded `prisma` handle in
  // the read model — the only permitted member accesses on it are none: it is
  // passed as an argument to the two wrappers and never dereferenced.
  const tenantModels = new Set([...TENANT_SCOPED_MODELS, ...DERIVED_TENANT_MODELS.keys()].map((m) => m[0].toLowerCase() + m.slice(1)));
  // Every value-use of the unguarded client, aliases followed: it may only be
  // handed to the two platform doors and the two request-bound entry points.
  const CLIENT_SINKS = new Set(["withPlatformFor", "withPlatformContractorFor", "platformOverviewFor", "contractorFactsFor"]);
  const prismaUses = usesOf(rmSrc, "prisma", "lib/platformReadModel.ts");
  const prismaStray = prismaUses.filter((u) => !(u.kind === "arg-of" && CLIENT_SINKS.has(u.callee) && u.index === 0));
  ok(`   every use of the unguarded client is an argument to a platform door (${prismaUses.length} uses, aliases followed)`, prismaUses.length > 0 && prismaStray.length === 0, prismaStray.map((u) => `${u.kind}:${u.text}@${u.line}`).join("; "));
  // WHICH bindings are privileged clients is derived from the source, never
  // spelled: the unguarded class is `prisma` plus the first parameter of each
  // `…For` entry point; the directory class is listContractors' first
  // parameter plus the client each genuine withPlatformFor door hands its
  // inline callback. A door whose callback is not written in place, or whose
  // client is destructured or unnamed, cannot be audited and is refused; a
  // name that falls in both classes is ambiguous and refused.
  const privilegedRoots = (src: string, file = "mutant.ts") => {
    const unguarded = new Set(["prisma", parameterOf(src, "platformOverviewFor", 0, file), parameterOf(src, "contractorFactsFor", 0, file)]);
    const doors = callbackParams(src, "withPlatformFor", 2, 0, file);
    const directory = new Set([parameterOf(src, "listContractors", 0, file), ...doors.map((d) => d.name)]);
    const problems = [...[...unguarded, ...directory].filter((n) => n.startsWith("<")).map((n) => `unauditable binding ${n}`), ...doors.filter((d) => d.resolution !== "import").map((d) => `withPlatformFor@${d.line} is not the imported door`), ...[...directory].filter((n) => unguarded.has(n)).map((n) => `\`${n}\` is both unguarded and directory`)];
    return { unguarded: [...unguarded], directory: [...directory], problems };
  };
  const roots = privilegedRoots(rmSrc, "lib/platformReadModel.ts");
  ok(`   the privileged client bindings are derived from the source (unguarded: ${roots.unguarded.join(", ")}; directory: ${roots.directory.join(", ")})`, roots.problems.length === 0 && roots.directory.length > 0 && roots.unguarded.length > 1, roots.problems.join("; "));
  // The unguarded parameters are held to the same rule as `prisma`: handed to
  // a door or to the facts reader as argument zero, never dereferenced.
  const UNGUARDED_SINKS = new Set([...CLIENT_SINKS, "readFacts"]);
  const unguardedStrays = (src: string, file = "mutant.ts", r = privilegedRoots(src, file)) => r.unguarded.filter((n) => n !== "prisma").flatMap((root) => usesOf(src, root, file).filter((u) => !(u.kind === "arg-of" && UNGUARDED_SINKS.has(u.callee) && u.index === 0)).map((u) => `${root}:${u.kind}:${u.text.slice(0, 40)}@${u.line}`));
  const ungStray = unguardedStrays(rmSrc, "lib/platformReadModel.ts", roots);
  ok(`   every use of an unguarded entry-point parameter is argument zero to a door or the facts reader`, ungStray.length === 0, ungStray.join("; "));
  // The directory clients (`platformDb`, and `db` where it is the unguarded
  // parameter) may reach platform models only — through any alias or destructure.
  // The directory clients are constrained POSITIVELY: a use is either a member
  // access on an approved platform model, or argument zero to an approved
  // sink. Anything else — an alias, a cast, a destructure, a spread, a return,
  // an escape into any other function — is a stray, however it is written.
  // An approved model member must be CALLED where it is read, with a read
  // method named in the source: `platformDb.contractor.findMany(…)`. A
  // delegate that is stored, bound, destructured, passed or returned would
  // carry the query out of the relation walker's sight, so it is a stray.
  const DIRECTORY_MODELS = new Set(["contractor", "contractorMembership"]);
  const DIRECTORY_READS = new Set(["findMany", "findFirst", "findUnique", "findFirstOrThrow", "findUniqueOrThrow", "count", "aggregate", "groupBy"]);
  const DIRECTORY_SINKS = new Set(["listContractors", "readFacts", ...CLIENT_SINKS]);
  const directoryStrays = (src: string, file = "mutant.ts", r = privilegedRoots(src, file)) => r.directory.filter((n) => !n.startsWith("<")).flatMap((root) => usesOf(src, root, file)
    .filter((u) => !((u.kind === "member" && DIRECTORY_MODELS.has(u.member) && u.called !== null && DIRECTORY_READS.has(u.called)) || (u.kind === "arg-of" && DIRECTORY_SINKS.has(u.callee) && u.index === 0)))
    .map((u) => `${root}:${u.kind}:${"member" in u ? u.member : ""}${u.kind === "member" ? `(${u.called ?? "not called"})` : ""}${u.text.slice(0, 40)}@${u.line}`));
  const dirStray = directoryStrays(rmSrc, "lib/platformReadModel.ts", roots);
  ok(`   every use of a directory client is an approved platform-model read CALLED in place, or an argument to an approved sink — no alias, cast, extracted delegate or escape`, dirStray.length === 0, dirStray.join("; "));
  // A directory read may name a platform model and still reach tenant rows
  // through a relation — include: { services: true }, a _count, a `where`
  // filter through a relation. Every relation the query touches, at any
  // depth, is resolved against the schema and must land on a non-tenant model.
  const relations = prismaRelations(readFileSync("prisma/schema.prisma", "utf8"));
  const tenantTargets = new Set([...TENANT_SCOPED_MODELS, ...DERIVED_TENANT_MODELS.keys()]);
  const badTraversal = (src: string, root: string) => relationTraversals(src, root, relations).filter((tr) => tenantTargets.has(tr.target) || tr.target === "<unknown>");
  const traversals = roots.directory.flatMap((r) => badTraversal(rmSrc, r).map((tr) => `${tr.path} -> ${tr.target}@${tr.line}`));
  ok(`   no directory query reaches a tenant-owned relation at any depth (include / select / _count / where)`, traversals.length === 0, traversals.join("; "));
  ok(`   and the schema parser sees the relation that would leak`, relations.Contractor?.services === "Service" && relations.Contractor?.sites === "ContractorSite" && relations.ContractorMembership?.user === "User");
  // An approved sink name must be the GENUINE function: an import from
  // lib/platformContext or a module-scope declaration of this file, not a
  // local that happens to share the name.
  const sinkOk = (r: ReturnType<typeof callsResolved>[number]) =>
    (r.kind === "import" && r.module === "./platformContext" && (r.exported === "withPlatformFor" || r.exported === "withPlatformContractorFor"))
    || (r.kind === "module-decl" && (r.form === "function" || r.form === "const") && ["listContractors", "platformOverviewFor", "contractorFactsFor"].includes(r.name))
    || (r.name === "readFacts" && r.kind === "shadowed" && /readFacts = opts\.readFacts \?\? contractorFactsFor/.test(r.shadowedBy ?? ""));
  const sinkCalls = [...DIRECTORY_SINKS].flatMap((n) => callsResolved(rmSrc, n, "lib/platformReadModel.ts"));
  const spoofed = sinkCalls.filter((r) => !sinkOk(r));
  ok(`   every approved-sink call resolves to the genuine function (${sinkCalls.length} calls), none to a shadowing local`, sinkCalls.length > 0 && spoofed.length === 0, spoofed.map((r) => `${r.name}:${r.kind}:${r.shadowedBy ?? r.module ?? ""}`).join("; "));
  // A genuine binding that is later WRITTEN is no longer the genuine function.
  // No approved sink or door name is assigned, updated, destructured into, or
  // used as a loop head anywhere in the read model; and nothing on a platform
  // surface can rewrite a binding at runtime (no eval, no Function).
  const SINK_NAMES = [...DIRECTORY_SINKS];
  const rebound = SINK_NAMES.flatMap((n) => assignmentsTo(rmSrc, n, "lib/platformReadModel.ts").map((a) => `${n}:${a.form}@${a.line}`));
  ok(`   no approved sink binding is ever reassigned, in any form`, rebound.length === 0, rebound.join("; "));
  const dynamicCode = [["lib/platformReadModel.ts", rmSrc] as const, ...surfaces.map((f) => [f, readFileSync(f, "utf8")] as const)].flatMap(([f, src]) => ["eval", "Function"].flatMap((g) => usesOf(src, g, f).map((u) => `${f}:${u.line} ${g}`)));
  ok(`   no platform file reaches for eval or Function`, dynamicCode.length === 0, dynamicCode.join("; "));
  ok(`   the catalog split is disjoint: quote-only decided first, priced and needs-a-price split the rest`,
    /where: \{ active: true, NOT: QUOTE_ONLY, publishedPriceApprovedAt: \{ not: null \} \}/.test(rmSrc) && /where: \{ active: true, NOT: QUOTE_ONLY, publishedPriceApprovedAt: null \}/.test(rmSrc) && /where: \{ active: true, \.\.\.QUOTE_ONLY \}/.test(rmSrc));
  ok(`   tenant facts are read only inside withPlatformContractorFor`, /withPlatformContractorFor\(db, user, contractorId, async \(guarded/.test(rm));
  ok(`   readiness is assessOnboarding's, payments connectReadiness's — no second engine`, /assessOnboarding\(guarded/.test(rm) && /connectReadiness\(/.test(rm) && !/canLaunch:\s*(true|false|!?[\w.]*blockers)/.test(rm) && !/stripeCardPaymentsStatus\s*[!=]==/.test(rm));
  ok(`   the read model never reads PlatformAccess or a membership to decide anything`, !/platformAccess/.test(rm) && !/\.email\s*[!=]==?/.test(rm));
  // Request access, by binding: only the Control Center may read anything from the request, and only `params`.
  const CC = "app/platform/contractors/[contractorId]/page.tsx";
  const access = surfaces.map((f) => ({ f, a: requestAccess(readFileSync(f, "utf8"), f) }));
  const strays = access.filter(({ f, a }) => f !== CC && a.length > 0).map(({ f, a }) => `${f}: ${a.map((x) => `${x.kind}@${x.line}`).join(",")}`);
  ok(`   no platform surface but the Control Center reads anything from the request`, strays.length === 0, strays.join("; "));
  const ccAccess = access.find(({ f }) => f === CC)?.a ?? [];
  const ccUse = paramsUses(readFileSync(CC, "utf8"), "platformContractor", CC);
  ok(`   the Control Center reads only \`params\`, and its SOLE use of params is the direct argument of the one platformContractor() call`,
    ccAccess.length === 1 && ccAccess[0].kind === "params-prop" && ccUse.local === "params" && ccUse.boundaryCalls === 1
      && ccUse.uses.length === 1 && ccUse.uses[0].kind === "boundary-arg" && ccUse.uses[0].text === "params.contractorId",
    `local=${ccUse.local} boundaryCalls=${ccUse.boundaryCalls} uses=${ccUse.uses.map((u) => `${u.kind}:${u.text}@${u.line}`).join(" | ")}`);
  ok(`   it 404s an unknown contractor and shows a "read-only" mark`, /PlatformContractorNotFoundError/.test(cc) && /notFound\(\)/.test(cc) && /read-only/.test(cc));
  const layout = strip("app/platform/layout.tsx");
  ok(`   the shell links the three views and still gates on the actor`, /\/platform\/contractors/.test(layout) && /\/platform\/attention/.test(layout) && /resolvePlatformActor\(\)/.test(layout));
  ok(`   no lifecycle, status or billing is invented anywhere`, [rm, ...surfaces.map(strip)].every((s) => !/TRIAL|PAST_DUE|SUSPENDED|CANCELED|lifecycle:|stripeCustomerId|subscription/.test(s)));
  ok(`   "embed installed" is never claimed`, !/installed/.test(rm) && surfaces.every((f) => !/embed (is )?installed|installed the embed/i.test(strip(f))));
  ok(`   token age is never read as disconnection`, /connected: jobber !== null,/.test(rm) && !/connected:\s*[^,\n]*expiresAt/.test(rm) && !/CALENDAR_DISCONNECTED[^\n]*expires/.test(rm));
  ok(`   sites are chosen by \`active\`, never by position`, /sites\.find\(\(x\) => x\.active\)/.test(rm) && !/sites\[0\]/.test(rm) && !/take: 1/.test(rm));
  ok(`   every contractor entry is isolated and bounded`, /mapWithConcurrency\(rows/.test(rm) && /catch \(e\)/.test(rm) && !/Promise\.all\(rows\.map/.test(rm));

  // ── 5. import policy and request access, proven on mutants ────────────
  const policed = sourceFiles(["app/platform", "app/api/platform", "components/platform"]);
  const violations = policed.flatMap((f) => importViolations(readFileSync(f, "utf8"), SURFACE_POLICY, f).map((v) => `${f} -> ${v}`));
  ok(`5. every platform surface — pages, components AND api routes — imports only from the allowlist (module and symbol)`, violations.length === 0, violations.join("; "));
  ok(`   the policed set covers ${policed.length} files including the api routes`, policed.some((f) => f.startsWith("app/api/platform/")) && policed.length >= 6);
  const rmViolations = importViolations(readFileSync("lib/platformReadModel.ts", "utf8"), READ_MODEL_POLICY, "lib/platformReadModel.ts");
  ok(`   and so does the read model`, rmViolations.length === 0, rmViolations.join("; "));
  const attention = readFileSync("app/platform/attention/page.tsx", "utf8");
  const ccSrc = readFileSync(CC, "utf8");
  const refused = (src: string, pol: Policy = SURFACE_POLICY) => importViolations(src, pol).length > 0;
  const mutants: [string, boolean][] = [
    ["a page aliasing headers()", refused(attention + '\nimport { headers as h } from "next/headers";\n')],
    ["a page importing a helper that writes", refused(attention + '\nimport { setTradeEnrolment } from "@/lib/tradeEnrolment";\n')],
    ["a page reaching the unguarded client by another name", refused(attention + '\nimport { platformDb as x } from "@/lib/tenantRoute";\n')],
    ["a page importing an unlisted symbol from an allowed module", refused(attention.replace("import { platformOverview, attentionSummary, STUCK_AFTER_DAYS }", "import { platformOverview, attentionSummary, STUCK_AFTER_DAYS, contractorFactsFor }"))],
    ["a namespace import of an allowed module", refused(attention + '\nimport * as rm2 from "@/lib/platformReadModel";\n')],
    ["a page using dynamic import()", refused(attention + '\nconst m = await import("@/lib/tradeEnrolment");\n')],
    ["a page using require()", refused(attention + '\nconst m = require("@/lib/tradeEnrolment");\n')],
    ["a bare side-effect import", refused(attention + '\nimport "@/lib/module-with-side-effects";\n')],
    ["a re-exported default page from an unapproved module", refused(attention + '\nexport { default } from "@/lib/unapproved-platform-page";\n')],
    ["a wildcard re-export", refused(attention + '\nexport * from "@/lib/unapproved-module";\n')],
    ["a namespaced wildcard re-export", refused(attention + '\nexport * as helpers from "@/lib/unapproved-module";\n')],
    ["a named re-export even from an allowed module", refused(attention + '\nexport { platformOverview } from "@/lib/platformReadModel";\n')],
    ["the read model importing a writer", refused(readFileSync("lib/platformReadModel.ts", "utf8") + '\nimport { setTradeEnrolment as s } from "./tradeEnrolment";\n', READ_MODEL_POLICY)],
  ];
  for (const [name, caught] of mutants) ok(`   mutant: ${name} is refused`, caught);
  ok(`   while a type-only import is allowed (it cannot run)`, !refused(attention + '\nimport type { Foo } from "@/lib/anything";\n'));
  ok(`   and so is a type-only re-export`, !refused(attention + '\nexport type { Foo } from "@/lib/anything";\n'));
  // request-access mutants: detected by binding, not by spelling
  const req = (src: string) => requestAccess(src).map((a) => a.kind);
  ok(`   mutant: a page destructuring { searchParams } is seen`, req(attention.replace("export default async function PlatformAttentionPage()", "export default async function PlatformAttentionPage({ searchParams }: { searchParams: Record<string, string> })")).includes("searchParams-prop"));
  ok(`   mutant: a page destructuring params under another name is seen`, req(attention.replace("export default async function PlatformAttentionPage()", "export default async function PlatformAttentionPage({ params: p }: { params: { x: string } })")).includes("params-prop"));
  ok(`   mutant: a page reading props.params is seen`, req(attention.replace("export default async function PlatformAttentionPage()", "export default async function PlatformAttentionPage(props: { params: { x: string } })").replace("const o = await platformOverview();", "const o = await platformOverview(); void props.params;")).includes("params-prop"));
  ok(`   mutant: an aliased headers() call is seen as a headers call`, req(attention + '\nimport { headers as h } from "next/headers";\nconst v = h();\n').includes("headers-call"));
  ok(`   mutant: an aliased cookies() call is seen`, req(attention + '\nimport { cookies as c } from "next/headers";\nconst v = c();\n').includes("cookies-call"));
  ok(`   mutant: a route handler that reads its request argument is seen`, req('export async function GET(req: Request) { const u = new URL(req.url); return Response.json({ u }); }').includes("request-arg"));
  // The request-supplied id may be used exactly once, as the boundary's argument.
  const sole = (src: string) => { const u = paramsUses(src, "platformContractor", CC); return u.boundaryCalls === 1 && u.uses.length === 1 && u.uses[0].kind === "boundary-arg"; };
  const CALL = "platformContractor(params.contractorId)";
  ok(`   the unmodified Control Center passes the sole-use rule`, sole(ccSrc));
  ok(`   mutant: passing anything but params.contractorId is refused`, !sole(ccSrc.replace(CALL, "platformContractor(params.contractorId ?? searchParams.id)")));
  ok(`   mutant: copying the id BEFORE the boundary call is refused`, !sole(ccSrc.replace("  let f;", "  const copiedId = params.contractorId;\n  let f;")));
  ok(`   mutant: copying the id AFTER the boundary call is refused`, !sole(ccSrc.replace("  const attention = attentionFor(f);", "  const attention = attentionFor(f);\n  const later = params.contractorId;")));
  ok(`   mutant: bracket access is refused`, !sole(ccSrc.replace(CALL, 'platformContractor(params["contractorId"])')));
  ok(`   mutant: a second read of the id is refused`, !sole(ccSrc.replace("  const attention = attentionFor(f);", "  const attention = attentionFor(f);\n  console.log(params.contractorId);")));
  ok(`   mutant: destructuring the id out of params is refused`, !sole(ccSrc.replace("  let f;", "  const { contractorId } = params;\n  let f;")));
  ok(`   mutant: passing params itself anywhere is refused`, !sole(ccSrc.replace("  let f;", "  void JSON.stringify(params);\n  let f;")));
  ok(`   mutant: spreading params is refused`, !sole(ccSrc.replace("  let f;", "  const p = { ...params };\n  let f;")));
  ok(`   mutant: destructuring contractorId in the parameter list is refused`, !sole(ccSrc.replace("{ params }: { params: { contractorId: string } }", "{ params: { contractorId } }: { params: { contractorId: string } }").replace(CALL, "platformContractor(contractorId)")));
  ok(`   mutant: a second boundary call is refused`, !sole(ccSrc.replace("  const attention = attentionFor(f);", "  const attention = attentionFor(f);\n  await platformContractor(params.contractorId);")));
  // Mutations by any spelling.
  ok(`   mutant: a write through a renamed client is seen`, mutatingCalls('const k = prisma; await k.service.updateMany({ where: {}, data: {} });').length === 1);
  ok(`   mutant: a raw statement is seen`, mutatingCalls("await db.$executeRawUnsafe(\"delete from x\")").length === 1);
  ok(`   mutant: a bracket-named mutator is seen`, mutatingCalls('await guarded.service["delete"]({ where: { id } });').length === 1);
  ok(`   mutant: a nested bracket mutator is seen`, mutatingCalls('await prisma["contractor"]["update"]({ where: { id }, data: {} });').length === 1);
  ok(`   mutant: a tagged raw statement is seen`, mutatingCalls("await db.$executeRaw`DELETE FROM contractors`;").length === 1);
  ok(`   mutant: a bracket-named tagged raw statement is seen`, mutatingCalls('await db["$queryRaw"]`select 1`;').length === 1);
  ok(`   mutant: a computed member call is refused as unknowable`, mutatingCalls("const m = pick(); await db.service[m]({});").length === 1);
  ok(`   mutant: a bracket dereference of prisma is seen`, memberAccessesOn('const s = prisma["service"];', "prisma").length === 1 && memberAccessesOn("const s = prisma[k];", "prisma")[0]?.member === "<computed>");
  // Review round 5: aliases, extractions, bracket props, and the Overview's claim.
  const strayOf = (src: string, root: string) => usesOf(src, root).filter((u) => !(u.kind === "arg-of" && CLIENT_SINKS.has(u.callee) && u.index === 0));
  ok(`   mutant: an aliased unguarded client reading a tenant model is seen`, strayOf(rmSrc + "\nasync function z() { const p = prisma; await p.service.findMany(); }", "prisma").length >= 1 && memberAccessesOn(rmSrc + "\nasync function z() { const p = prisma; await p.service.findMany(); }", "prisma").some((m) => m.member === "service"));
  ok(`   mutant: an alias of an alias is still seen`, memberAccessesOn("const p = prisma; const q = p; q.booking.count();", "prisma").some((m) => m.member === "booking"));
  ok(`   mutant: an aliased directory client reading a tenant model is seen`, memberAccessesOn("async function f(platformDb: PrismaClient) { const p = platformDb; await p.service.findMany(); }", "platformDb").some((m) => m.member === "service"));
  ok(`   mutant: destructuring a model out of the unguarded client is seen`, memberAccessesOn("const { service } = prisma;", "prisma").some((m) => m.member === "service"));
  ok(`   mutant: reassigning the client into another name is seen`, memberAccessesOn("let p; p = prisma; p.quote.count();", "prisma").some((m) => m.member === "quote"));
  ok(`   mutant: passing the client to an unlisted function is a stray use`, strayOf("export const x = (u: null) => helper(prisma);", "prisma").length === 1);
  ok(`   mutant: an extracted mutator is seen at extraction`, mutatingCalls("const write = db.service.delete; await write({ where: { id } });").some((m) => /extracted/.test(m.callee)));
  ok(`   mutant: a destructured mutator is seen`, mutatingCalls("const { update } = db.service; await update({ where: { id }, data });").some((m) => /destructured/.test(m.callee)));
  ok(`   mutant: a rest-destructure of a model is seen (it carries every mutator)`, mutatingCalls("const { findMany, ...rest } = db.service;").some((m) => /rest/.test(m.callee)));
  ok(`   while reading a model's findMany by extraction is not a mutation`, mutatingCalls("const read = db.service.findMany; await read();").length === 0);
  const bracketProps = 'export default function Page(props) { return props["params"].contractorId; }';
  ok(`   mutant: bracket access to params on a props argument is seen`, requestAccess(bracketProps).some((a) => a.kind === "params-prop"));
  ok(`   mutant: computed access on a props argument is seen`, requestAccess("export default function Page(props) { const k = pick(); return props[k].x; }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: destructuring params out of props is seen`, requestAccess("export default function Page(props) { const { params } = props; return params.x; }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: an aliased props argument is seen`, requestAccess("export default function Page(props) { const q = props; return q.params.x; }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: a rest-destructured props parameter is seen`, requestAccess("export default function Page({ ...rest }) { return rest.params.x; }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: props escaping into a helper is seen`, requestAccess("export default function Page(props) { return helper(props); }").some((a) => /escape/.test(a.detail)));
  ok(`   while a page that never reads props is clean`, requestAccess("export default async function Page() { const o = await platformOverview(); return o.total; }").length === 0);
  // Review round 6: casts, escapes, second-argument route context, computed destructure keys.
  const dirStrayOf = (src: string, root: string) => usesOf(src, root).filter((u) => !((u.kind === "member" && DIRECTORY_MODELS.has(u.member)) || (u.kind === "arg-of" && DIRECTORY_SINKS.has(u.callee) && u.index === 0)));
  ok(`   mutant: a cast alias of a directory client is a stray`, dirStrayOf("async function f(platformDb: PrismaClient) { const p = platformDb as PrismaClient; await p.service.findMany(); }", "platformDb").length >= 1);
  ok(`   mutant: a parenthesised, non-null, satisfies alias is a stray`, dirStrayOf("async function f(platformDb: PrismaClient) { const p = ((platformDb!) satisfies PrismaClient); await p.quote.count(); }", "platformDb").length >= 1);
  ok(`   mutant: handing a directory client to a local function is a stray`, dirStrayOf("async function read(client: PrismaClient) { return client.service.findMany(); } async function f(platformDb: PrismaClient) { await read(platformDb); }", "platformDb").some((u) => u.kind === "arg-of"));
  ok(`   mutant: returning or spreading a directory client is a stray`, dirStrayOf("function f(platformDb: PrismaClient) { return platformDb; }", "platformDb").length === 1 && dirStrayOf("function f(platformDb: PrismaClient) { return { ...platformDb }; }", "platformDb").length === 1);
  ok(`   while the approved reads are not strays`, dirStrayOf("async function f(platformDb: PrismaClient) { await platformDb.contractor.findMany(); await platformDb.contractorMembership.findMany(); return listContractors(platformDb); }", "platformDb").length === 0);
  ok(`   mutant: a cast alias of props is seen`, requestAccess("export default function Page(props) { const p = props as any; return p.params.contractorId; }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: route context in the SECOND argument is seen`, requestAccess("export async function GET(_req: Request, { params }: { params: { contractorId: string } }) { return Response.json({ id: params.contractorId }); }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: a second argument read by name is seen`, requestAccess("export async function GET(_req: Request, ctx: { params: { id: string } }) { return Response.json({ id: ctx.params.id }); }").some((a) => a.kind === "params-prop"));
  ok(`   mutant: a computed literal destructure of a mutator is seen`, mutatingCalls('const { ["delete"]: write } = db.service; await write({ where: { id } });').some((m) => /delete/.test(m.callee)));
  ok(`   mutant: a computed non-literal destructure is refused as unknowable`, mutatingCalls("const { [k]: w } = db.service;").some((m) => /computed/.test(m.callee)));
  ok(`   mutant: a string-literal-keyed destructure of a mutator is seen`, mutatingCalls('const { "update": u } = db.service;').some((m) => /update/.test(m.callee)));
  ok(`   mutant: a cast alias of the unguarded client is seen`, memberAccessesOn("const p = prisma as PrismaClient; p.booking.count();", "prisma").some((m) => m.member === "booking"));
  // Review round 7: relation traversal, sink spoofing, destructuring assignment, `arguments`.
  ok(`   mutant: include: { services: true } on a contractor read is a tenant traversal`, badTraversal("async function f(platformDb: PrismaClient) { await platformDb.contractor.findMany({ include: { services: true } }); }", "platformDb").some((tr) => tr.target === "Service"));
  ok(`   mutant: a _count of services is a tenant traversal`, badTraversal("async function f(platformDb: PrismaClient) { await platformDb.contractor.findMany({ select: { id: true, _count: { select: { services: true } } } }); }", "platformDb").some((tr) => tr.target === "Service"));
  ok(`   mutant: filtering contractors by a service relation is a tenant traversal`, badTraversal("async function f(platformDb: PrismaClient) { await platformDb.contractor.findMany({ where: { services: { some: { active: true } } } }); }", "platformDb").some((tr) => tr.target === "Service"));
  const deep = "async function f(platformDb: PrismaClient) { await platformDb.contractor.findMany({ include: { sites: { include: { contractor: { include: { services: true } } } } } }); }";
  ok(`   mutant: a tenant relation three levels down is seen`, badTraversal(deep, "platformDb").some((tr) => tr.target === "Service" && /sites\.include\.contractor\.include\.services/.test(tr.path)));
  ok(`   and every hop on the way is resolved against the schema`, relationTraversals(deep, "platformDb", relations).map((tr) => tr.target).join(">") === "ContractorSite>Contractor>Service");
  ok(`   mutant: an opaque (non-literal) query argument is refused as unknowable`, badTraversal("async function f(platformDb: PrismaClient, q: object) { await platformDb.contractor.findMany(q); }", "platformDb").length === 1);
  ok(`   mutant: a bracket-form model (platformDb["contractor"]) is traversed like the dot form`, badTraversal('async function f(platformDb: PrismaClient) { await platformDb["contractor"].findMany({ include: { services: true } }); }', "platformDb").some((tr) => tr.target === "Service"));
  ok(`   mutant: a bracket-form method (contractor["findMany"]) is traversed too`, badTraversal('async function f(platformDb: PrismaClient) { await platformDb.contractor["findMany"]({ include: { services: true } }); }', "platformDb").some((tr) => tr.target === "Service"));
  ok(`   mutant: a computed model or method on the directory client is unknowable`, badTraversal("async function f(platformDb: PrismaClient, m: string) { await platformDb[m as never].findMany({}); }", "platformDb").some((tr) => tr.target === "<unknown>") && badTraversal("async function f(platformDb: PrismaClient, k: string) { await platformDb.contractor[k as never]({}); }", "platformDb").some((tr) => tr.target === "<unknown>"));
  ok(`   mutant: a cast between the hops hides nothing`, badTraversal("async function f(platformDb: PrismaClient) { await ((platformDb as any).contractor as any).findMany({ include: { services: true } }); }", "platformDb").some((tr) => tr.target === "Service"));
  ok(`   mutant: a spread argument is refused as unknowable`, badTraversal("async function f(platformDb: PrismaClient, args: [object]) { await platformDb.contractor.findMany(...args); }", "platformDb").some((tr) => tr.target === "<unknown>"));
  ok(`   mutant: an extracted delegate (const contractor = platformDb.contractor) is a stray, so its later query cannot escape the walker`, privilegedRoots("async function listContractors(platformDb: PrismaClient) { return 0; }").directory.includes("platformDb") && directoryStrays("async function listContractors(platformDb: PrismaClient) { const contractor = platformDb.contractor; return contractor.findMany({ include: { services: true } }); }").length > 0);
  ok(`   mutant: a bound query method is a stray`, directoryStrays("async function listContractors(platformDb: PrismaClient) { const fm = platformDb.contractor.findMany.bind(platformDb.contractor); return fm({ include: { services: true } }); }").length > 0 && directoryStrays("async function listContractors(platformDb: PrismaClient) { const fm = platformDb.contractor.findMany; return fm({}); }").length > 0);
  ok(`   mutant: a destructured query method is a stray`, directoryStrays("async function listContractors(platformDb: PrismaClient) { const { findMany } = platformDb.contractor; return findMany({}); }").length > 0);
  ok(`   mutant: a delegate passed or returned is a stray`, directoryStrays("async function listContractors(platformDb: PrismaClient) { return helper(platformDb.contractor); }").length > 0 && directoryStrays("function listContractors(platformDb: PrismaClient) { return platformDb.contractor; }").length > 0);
  ok(`   mutant: a computed or non-read method on the delegate is a stray`, directoryStrays("async function listContractors(platformDb: PrismaClient, k: string) { return platformDb.contractor[k as never]({}); }").length > 0 && directoryStrays("async function listContractors(platformDb: PrismaClient) { return platformDb.contractor.fields; }").length > 0);
  ok(`   while the read model's inline reads are not strays`, directoryStrays("async function listContractors(platformDb: PrismaClient) { return (platformDb.contractor as any).findMany({ where: { id: '1' } }); }").length === 0);
  const DOOR = 'import { withPlatformFor } from "./platformContext";\n';
  ok(`   mutant: listContractors with its parameter renamed still cannot read a tenant model (the binding, not the name)`, directoryStrays("export async function listContractors(client: PrismaClient) { return client.service.findMany({}); }").length > 0);
  ok(`   mutant: the door's callback client renamed still cannot read a tenant model`, directoryStrays(DOOR + "export async function platformOverviewFor(x: PrismaClient, user: unknown) { return withPlatformFor(x, user, async (whatever) => whatever.service.findMany({})); }").length > 0);
  ok(`   mutant: an entry-point parameter renamed still cannot be dereferenced`, unguardedStrays(DOOR + "export async function platformOverviewFor(client: PrismaClient, user: unknown) { return client.contractor.findMany({}); }").length > 0 && unguardedStrays("export async function contractorFactsFor(handle: PrismaClient, user: unknown, id: unknown) { return handle.service.findMany({}); }").length > 0);
  ok(`   mutant: the real read model with its directory parameter renamed and pointed at a tenant model is refused`, directoryStrays(rmSrc.replace("listContractors(platformDb: PrismaClient)", "listContractors(client: PrismaClient)").replace("await platformDb.contractor.findMany(", "await client.service.findMany("), "lib/platformReadModel.ts").length > 0);
  ok(`   while the real read model with every directory binding renamed, reads unchanged, is still clean`, (() => { const renamed = rmSrc.replace(/\bplatformDb\b/g, "dir"); const r = privilegedRoots(renamed, "lib/platformReadModel.ts"); return r.problems.length === 0 && r.directory.includes("dir") && !r.directory.includes("platformDb") && directoryStrays(renamed, "lib/platformReadModel.ts", r).length === 0 && r.directory.every((x) => badTraversal(renamed, x).length === 0); })());
  ok(`   mutant: a door callback not written in place cannot be audited and is refused`, privilegedRoots(DOOR + "export async function platformOverviewFor(db: PrismaClient, user: unknown) { return withPlatformFor(db, user, handler); }").problems.some((p) => /not-inline/.test(p)));
  ok(`   mutant: a door callback that destructures or drops its client is refused`, privilegedRoots(DOOR + "export async function platformOverviewFor(db: PrismaClient, user: unknown) { return withPlatformFor(db, user, async ({ contractor }) => contractor.findMany({})); }").problems.some((p) => /pattern/.test(p)) && privilegedRoots(DOOR + "export async function platformOverviewFor(db: PrismaClient, user: unknown) { return withPlatformFor(db, user, async () => 0); }").problems.some((p) => /missing/.test(p)));
  ok(`   mutant: a withPlatformFor that is not the imported door is refused`, privilegedRoots("function withPlatformFor(a: unknown, b: unknown, cb: (c: unknown) => unknown) { return cb(a); } export async function platformOverviewFor(db: PrismaClient, user: unknown) { return withPlatformFor(db, user, async (platformDb) => 0); }").problems.some((p) => /not the imported door/.test(p)));
  ok(`   mutant: one name in both classes is ambiguous and refused`, privilegedRoots(DOOR + "export async function listContractors(db: PrismaClient) { return db.contractor.findMany({}); } export async function platformOverviewFor(db: PrismaClient, user: unknown) { return withPlatformFor(db, user, async (platformDb) => listContractors(platformDb)); }").problems.some((p) => /both unguarded and directory/.test(p)));
  ok(`   while the read model's own site and owner selects are not`, roots.directory.every((r) => badTraversal(rmSrc, r).length === 0));
  ok(`   mutant: a shadowing local named like an approved sink is not the sink`, callsResolved("async function f(platformDb: PrismaClient) { const listContractors = (db: PrismaClient) => db.service.findMany(); return listContractors(platformDb); }", "listContractors").every((r) => r.kind === "shadowed"));
  ok(`   mutant: a shadowing parameter is not the sink either`, callsResolved("function g(listContractors: (x: unknown) => unknown, platformDb: PrismaClient) { return listContractors(platformDb); }", "listContractors").every((r) => r.kind === "shadowed"));
  ok(`   mutant: a destructured local ({ listContractors } = evil) beside the genuine function is a shadow`, callsResolved("function listContractors(db: PrismaClient) { return db.contractor.findMany(); } async function f(platformDb: PrismaClient) { const { listContractors } = evil; return listContractors(platformDb); }", "listContractors").every((c) => c.kind === "shadowed"));
  ok(`   mutant: an array-pattern local is a shadow`, callsResolved("function listContractors() {} async function f(platformDb: PrismaClient) { const [listContractors] = evil; return listContractors(platformDb); }", "listContractors").every((c) => c.kind === "shadowed"));
  ok(`   mutant: a nested pattern is a shadow`, callsResolved("function listContractors() {} async function f(platformDb: PrismaClient) { const { a: { b: [listContractors] } } = evil; return listContractors(platformDb); }", "listContractors").every((c) => c.kind === "shadowed"));
  ok(`   mutant: a destructured parameter is a shadow`, callsResolved("function listContractors() {} async function f({ listContractors }: any, platformDb: PrismaClient) { return listContractors(platformDb); }", "listContractors").every((c) => c.kind === "shadowed"));
  ok(`   mutant: a catch binding is a shadow`, callsResolved("function listContractors() {} async function f(platformDb: PrismaClient) { try { throw 0; } catch (listContractors) { return (listContractors as any)(platformDb); } }", "listContractors").every((c) => c.kind === "shadowed"));
  ok(`   mutant: a module-scope pattern binding is not the genuine sink`, callsResolved("const { listContractors } = evil; async function f(platformDb: PrismaClient) { return listContractors(platformDb); }", "listContractors").every((c) => c.kind !== "module-decl"));
  ok(`   mutant: two module-scope declarations of the name are not the genuine sink`, callsResolved("function listContractors() {} var listContractors = evil; async function f(platformDb: PrismaClient) { return listContractors(platformDb); }", "listContractors").every((c) => c.kind !== "module-decl"));
  ok(`   mutant: a genuine sink reassigned before the call is seen`, assignmentsTo("function listContractors(db: PrismaClient) { return db.contractor.findMany(); } async function probe(platformDb: PrismaClient) { listContractors = ((client: PrismaClient) => client.service.findMany()) as any; return listContractors(platformDb); }", "listContractors").some((a) => a.form === "assignment"));
  ok(`   mutant: a compound assignment, an update, a destructuring assignment and a loop head are all writes`, assignmentsTo("listContractors ??= evil;", "listContractors").length === 1 && assignmentsTo("listContractors++;", "listContractors").length === 1 && assignmentsTo("({ a: { b: [listContractors = x] } } = evil);", "listContractors").some((a) => a.form === "destructuring-assignment") && assignmentsTo("[, ...listContractors] = evil;", "listContractors").length === 1 && assignmentsTo("for (listContractors of xs) {}", "listContractors").some((a) => a.form === "for-head"));
  ok(`   mutant: a module-scope let or var is not a genuine sink even unassigned`, callsResolved("let listContractors = (db: PrismaClient) => db.contractor.findMany(); async function f(platformDb: PrismaClient) { return listContractors(platformDb); }", "listContractors").every((c) => c.kind === "module-decl" && c.form === "let") && !sinkOk(callsResolved("let listContractors = () => 0; listContractors(1);", "listContractors")[0]));
  ok(`   mutant: eval on a platform surface is seen`, usesOf("export default function Page() { return eval('x'); }", "eval").length === 1 && usesOf("const f = new Function('return 1'); f();", "Function").length === 1);
  ok(`   while a property write on some other object is not a binding write`, assignmentsTo("row.listContractors = 1; o['listContractors'] = 2;", "listContractors").length === 0);
  ok(`   while the real module-scope sink resolves as such`, callsResolved(rmSrc, "listContractors", "lib/platformReadModel.ts").every((r) => r.kind === "module-decl") && callsResolved(rmSrc, "withPlatformFor", "lib/platformReadModel.ts").every((r) => r.kind === "import" && r.module === "./platformContext"));
  ok(`   mutant: a destructuring ASSIGNMENT of a mutator is seen`, mutatingCalls("let write; ({ delete: write } = db.service); await write({ where: { id } });").some((m) => /assigned/.test(m.callee)));
  ok(`   mutant: a computed-key destructuring assignment is seen`, mutatingCalls('let w; ({ ["update"]: w } = db.service);').some((m) => /update/.test(m.callee)));
  ok(`   mutant: destructuring the unguarded client by assignment is seen`, memberAccessesOn("let service; ({ service } = prisma);", "prisma").some((m) => m.member === "service"));
  ok(`   mutant: implicit \`arguments\` on a page is refused`, requestAccess("export default function Page() { return arguments[0].params.contractorId; }").some((a) => a.kind === "arguments-object"));
  ok(`   mutant: \`arguments\` passed onward is refused too`, requestAccess("export default function Page() { return helper(arguments); }").some((a) => a.kind === "arguments-object"));
  ok(`   and no platform surface touches \`arguments\``, surfaces.every((f) => !requestAccess(readFileSync(f, "utf8"), f).some((a) => a.kind === "arguments-object")));
  ok(`   while a column named createdAt is not a write`, mutatingCalls("const t = row.createdAt; const u = svc.updatedAt;").length === 0);
  ok(`   mutant: the read model dereferencing prisma is seen`, memberAccessesOn(rmSrc + "\nconst stray = prisma.service;", "prisma").length === 1);

  // ── 6. the attention page cannot call an unread contractor healthy ─────
  const { attentionSummary } = await import("../lib/platformReadModel");
  const none: never[] = [];
  const clear = attentionSummary(none, []);
  const partialSummary = attentionSummary(none, [{ name: "Probe" }]);
  ok(`6. with nothing to list and every contractor read, the page may say all is well`, clear.tone === "clear" && /Every contractor past setup/.test(clear.message));
  ok(`   with nothing to list but an unreadable contractor, it may NOT`, partialSummary.tone === "partial" && /among readable contractors/.test(partialSummary.message) && /Probe/.test(partialSummary.message) && !/Every contractor/.test(partialSummary.message));
  ok(`   with items, it counts them`, attentionSummary([{ code: "STUCK_IN_ONBOARDING", contractorId: "x", slug: "x", name: "X", message: "m", href: "/platform/contractors/x" }], [{ name: "Probe" }]).tone === "items");
  const overviewSrc = strip("app/platform/page.tsx");
  ok(`   the Overview takes its empty state from attentionSummary too, and marks the tile partial when anything was unreadable`,
    /attentionSummary\(o\.attention, o\.unreadable\)/.test(overviewSrc) && /summary\.message/.test(overviewSrc) && /summary\.tone === "partial"/.test(overviewSrc) && !/Nothing needs a person at Price2Book today/.test(overviewSrc));
  const attentionSrc = strip("app/platform/attention/page.tsx");
  ok(`   and the page renders the unreadable list and takes its empty state from attentionSummary`,
    /o\.unreadable\.length > 0/.test(attentionSrc) && /attentionSummary\(o\.attention, o\.unreadable\)/.test(attentionSrc) && /summary\.message/.test(attentionSrc) && !/Nothing\. Every contractor/.test(attentionSrc));

  await teardown();
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Staff may know. They cannot touch. And they enter through the same door every time.\n`);
  await raw.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await teardown(); await raw.$disconnect(); process.exit(1); });
