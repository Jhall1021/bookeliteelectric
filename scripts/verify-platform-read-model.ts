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
import { importViolations, requestAccess, mutatingCalls, memberAccessesOn, callsTo, type Policy } from "./_platformSurfaceAudit";
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
  const prismaTouches = memberAccessesOn(rmSrc, "prisma", "lib/platformReadModel.ts");
  ok(`   the read model never dereferences the unguarded client itself (${prismaTouches.length} member accesses)`, prismaTouches.length === 0, prismaTouches.map((t) => `.${t.member}@${t.line}`).join(", "));
  const platformDbTouches = memberAccessesOn(rmSrc, "platformDb", "lib/platformReadModel.ts").filter((t) => tenantModels.has(t.member));
  ok(`   and the directory client touches no tenant model`, platformDbTouches.length === 0, platformDbTouches.map((t) => `.${t.member}@${t.line}`).join(", "));
  ok(`   tenant facts are read only inside withPlatformContractorFor`, /withPlatformContractorFor\(db, user, contractorId, async \(guarded/.test(rm));
  ok(`   readiness is assessOnboarding's, payments connectReadiness's — no second engine`, /assessOnboarding\(guarded/.test(rm) && /connectReadiness\(/.test(rm) && !/canLaunch:\s*(true|false|!?[\w.]*blockers)/.test(rm) && !/stripeCardPaymentsStatus\s*[!=]==/.test(rm));
  ok(`   the read model never reads PlatformAccess or a membership to decide anything`, !/platformAccess/.test(rm) && !/\.email\s*[!=]==?/.test(rm));
  // Request access, by binding: only the Control Center may read anything from the request, and only `params`.
  const CC = "app/platform/contractors/[contractorId]/page.tsx";
  const access = surfaces.map((f) => ({ f, a: requestAccess(readFileSync(f, "utf8"), f) }));
  const strays = access.filter(({ f, a }) => f !== CC && a.length > 0).map(({ f, a }) => `${f}: ${a.map((x) => `${x.kind}@${x.line}`).join(",")}`);
  ok(`   no platform surface but the Control Center reads anything from the request`, strays.length === 0, strays.join("; "));
  const ccAccess = access.find(({ f }) => f === CC)?.a ?? [];
  const ccCalls = callsTo(readFileSync(CC, "utf8"), "platformContractor", CC);
  ok(`   the Control Center reads only \`params\` and hands params.contractorId straight to platformContractor()`,
    ccAccess.length === 1 && ccAccess[0].kind === "params-prop" && ccCalls.length === 1 && ccCalls[0].args.join() === "params.contractorId");
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
  ok(`   mutant: the Control Center passing anything but params.contractorId is refused`, (() => { const src = ccSrc.replace("platformContractor(params.contractorId)", "platformContractor(params.contractorId ?? searchParams.id)"); const calls = callsTo(src, "platformContractor", CC); return calls.length === 1 && calls[0].args.join() !== "params.contractorId"; })());
  ok(`   mutant: a write through a renamed client is seen`, mutatingCalls('const k = prisma; await k.service.updateMany({ where: {}, data: {} });').length === 1);
  ok(`   mutant: a raw statement is seen`, mutatingCalls("await db.$executeRawUnsafe(\"delete from x\")").length === 1);
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
