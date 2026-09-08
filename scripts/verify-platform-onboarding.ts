/**
 * FOUNDER ONBOARDING — the platform side may act, but only through the door,
 * and only by delegating to the authority that already owns the decision.
 *
 * What this proves, against the real database with run-unique fixtures it
 * creates and destroys itself, and against the source by syntax tree:
 *
 *   authorization    signed-out and non-staff sessions are refused by every
 *                    command before anything is read or written; an unknown
 *                    contractor id is refused after authorization
 *   tenant boundary  the wizard's contractor sees only its own catalog; the
 *                    foreign tenant's services are untouched throughout
 *   idempotency      a repeated create is a SLUG_TAKEN pointing at the first
 *                    (sequential AND concurrent); a repeated owner is the same
 *                    membership; a repeated trade is the same enrolment; a
 *                    repeated install is "already", with the same service count
 *   partial failure  a launch reports every service's outcome, and a refused
 *                    launch activates nothing
 *   resumability     progress is re-derived from the rows after every step
 *   template path    installation runs preflight + installCatalog; the source
 *                    calls nothing else
 *   no auto-activate every installed service is inactive afterwards, and the
 *                    install command never mentions activation
 *   launch guard     launch calls assessOnboarding first, refuses on blockers,
 *                    and activates only through activateService
 *   one engine       the module never computes canLaunch or readiness itself
 *   cleanup          every fixture is gone at the end, and proven gone
 *
 * NO PlatformAccess ROW IS WRITTEN. Staff-ness comes from a recording double
 * whose platformAccess.findUnique answers from memory; every other model is
 * the real client.
 */

import { PrismaClient, type PlatformRole } from "@prisma/client";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { sourceFiles } from "./_sourceFiles";
import { destroyContractor } from "./_throwaway";
import { importViolations, mutatingCalls, usesOf, callsTo, requestAccess, type Policy } from "./_platformSurfaceAudit";
import {
  onboardingProgress, onboardingStatusFor, onboardingIndexFor,
  beginContractorFor, attachOwnerFor, enrolTradeFor, installTradeTemplateFor, launchContractorFor, retireContractorFor, noticeText, LAUNCH_GUARD_CONCURRENCY,
} from "../lib/platformOnboarding";
import { attentionFor } from "../lib/platformReadModel";
import { availableTrades } from "../lib/templateProvisioning";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { validateIdentity, slugify, SLUG_INPUT_PATTERN, SLUG_MAX } from "../lib/contractorCreation";
import { hostedSlugProblem } from "../lib/siteRouting";
import { FIXTURE_SLUG_PREFIXES, isFixtureContractorSlug } from "../lib/fixtureContractors";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-platform-onboarding";
const SLUG = `${SLUG_PREFIX}-${RUN}`;
const SLUG2 = `${SLUG_PREFIX}-${RUN}-b`;
const USER_PREFIX = "test-platform-onboarding";
const EMAIL_PREFIX = "p2b-verify-platform-onb-";
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

async function removeContractor(slug: string) {
  await raw.contractorTrade.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorMembership.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}
async function teardown() {
  await removeContractor(SLUG); await removeContractor(SLUG2);
  await raw.user.deleteMany({ where: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } } }).catch(() => {});
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({ where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG, SLUG2] } }, createdAt: { lt: cutoff } }, select: { slug: true } });
  for (const c of stale) await removeContractor(c.slug);
  await raw.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX }, createdAt: { lt: cutoff } } }).catch(() => {});
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

const MODULE = "lib/platformOnboarding.ts";
const ONBOARDING_POLICY: Policy = {
  "./prisma": ["prisma"],
  "./adminContext": ["currentUser"],
  "./platformContext": ["withPlatformFor", "withPlatformContractorFor"],
  "./platformReadModel": ["contractorFactsFor", "listContractors", "mapWithConcurrency"],
  "./contractorCreation": ["validateIdentity", "slugTaken", "createContractorRecord", "isUniqueViolation", "SLUG_INPUT_PATTERN", "SLUG_MAX", "IdentityOptions", "withOwnershipLock", "ownsAnotherBusiness", "OwnershipConflictError"],
  "./tradeEnrolment": ["setTradeEnrolment"],
  "./templateProvisioning": ["availableTrades", "templateVersionSource", "preflight", "installCatalog"],
  "./onboardingReadiness": ["assessOnboarding"],
  "./serviceActivation": ["activateService", "activationRefusal"],
  "./fixtureContractors": ["partitionFixtures"],
  "./contractorInvitations": ["mintInvitationToken", "INVITATION_TTL_MS", "InvitationDisplayStatus"],
  "./auth": ["sendInvitationEmail", "resolveBaseUrl"],
};
const DOORS = new Set(["withPlatformFor", "withPlatformContractorFor"]);

/** For every mutating call in the module: is it lexically inside a callback handed to a platform door? */
function writesOutsideDoors(source: string): string[] {
  const sf = ts.createSourceFile(MODULE, source, ts.ScriptTarget.Latest, true);
  const out: string[] = [];
  const insideDoor = (n: ts.Node): boolean => {
    let cur: ts.Node | undefined = n;
    while (cur) {
      if (ts.isCallExpression(cur) && ts.isIdentifier(cur.expression) && DOORS.has(cur.expression.text)) return true;
      cur = cur.parent;
    }
    return false;
  };
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && (ts.isPropertyAccessExpression(n.expression) || ts.isElementAccessExpression(n.expression))) {
      const name = ts.isPropertyAccessExpression(n.expression) ? n.expression.name.text : "<computed>";
      if (/^(create|update|upsert|delete|createMany|updateMany|deleteMany|\$transaction|\$executeRaw|\$executeRawUnsafe|\$queryRaw|\$queryRawUnsafe)$/.test(name) || name === "<computed>") {
        if (!insideDoor(n)) out.push(`${name}@${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1}`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

/** Every `href` a TSX file renders, with what kind of expression it is: a literal/template's leading text, or "<dynamic>" for anything else. */
function hrefsIn(file: string): { text: string; line: number }[] {
  const src = readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: { text: string; line: number }[] = [];
  const at = (n: ts.Node) => sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1;
  const visit = (n: ts.Node) => {
    if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === "href" && n.initializer) {
      const init = n.initializer;
      if (ts.isStringLiteral(init)) out.push({ text: init.text, line: at(n) });
      else if (ts.isJsxExpression(init) && init.expression) {
        const e = init.expression;
        if (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)) out.push({ text: e.text, line: at(n) });
        else if (ts.isTemplateExpression(e)) out.push({ text: e.head.text, line: at(n) });
        else out.push({ text: "<dynamic>", line: at(n) });
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf); return out;
}

function outcomeOfRetry(r: Awaited<ReturnType<typeof launchContractorFor>>, id: string) { return "outcomes" in r ? r.outcomes.find((o) => o.serviceId === id)?.outcome : undefined; }

/** The body text of one top-level exported function declaration. */
function fnBody(source: string, name: string): string {
  const sf = ts.createSourceFile(MODULE, source, ts.ScriptTarget.Latest, true);
  for (const st of sf.statements) {
    if (ts.isFunctionDeclaration(st) && st.name?.text === name && st.body) return st.body.getText(sf);
  }
  return "";
}

async function main() {
  console.log(`\nPLATFORM ONBOARDING — the founder may act, only through the door, only by delegating\n`);
  await teardown();
  await sweepStale();

  const t0 = new Date();
  const staff = { id: `${USER_PREFIX}-${RUN}-staff`, email: `${EMAIL_PREFIX}${RUN}-staff@invalid.test` };
  const db = doubleWith({ [staff.id]: { role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: null } });
  const owner = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-owner`, email: `${EMAIL_PREFIX}${RUN}-owner@invalid.test`, name: "Onboarding owner", emailVerified: true }, select: { id: true, email: true } });
  const unverified = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-unverified`, email: `${EMAIL_PREFIX}${RUN}-unverified@invalid.test`, name: "Unverified", emailVerified: false }, select: { id: true, email: true } });
  const other = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-other`, email: `${EMAIL_PREFIX}${RUN}-other@invalid.test`, name: "Owns another", emailVerified: true }, select: { id: true, email: true } });
  const foreign = await raw.contractor.findFirstOrThrow({ where: { services: { some: {} }, NOT: { slug: { startsWith: SLUG_PREFIX } } }, select: { id: true, slug: true } });
  const foreignServicesBefore = await raw.service.count({ where: { contractorId: foreign.id } });
  const foreignActiveBefore = await raw.service.count({ where: { contractorId: foreign.id, active: true } });
  const trades = await availableTrades(raw);
  const trade = trades[0];
  ok(`0. a published trade exists to onboard against (${trades.join(", ")})`, !!trade);

  try {
    // ── 1. refusals first, for every command ────────────────────────────
    const nobody = { id: `${USER_PREFIX}-${RUN}-nobody`, email: `${EMAIL_PREFIX}${RUN}-nobody@invalid.test` };
    ok(`1. signed out cannot begin a contractor`, (await throwsWith(() => beginContractorFor(db, null, { name: "X", slug: SLUG }))) === "NotAuthenticatedError");
    ok(`   a session without a grant cannot begin one`, (await throwsWith(() => beginContractorFor(db, nobody, { name: "X", slug: SLUG }))) === "NotPlatformStaffError");
    ok(`   nor the contractor's own OWNER`, (await throwsWith(() => beginContractorFor(db, owner, { name: "X", slug: SLUG }))) === "NotPlatformStaffError");
    ok(`   and no contractor was created by any refused attempt`, (await raw.contractor.count({ where: { slug: SLUG } })) === 0);
    for (const [label, run] of [
      ["attach an owner", () => attachOwnerFor(db, nobody, foreign.id, owner.email)],
      ["enrol a trade", () => enrolTradeFor(db, nobody, foreign.id, trade)],
      ["install a template", () => installTradeTemplateFor(db, nobody, foreign.id)],
      ["launch", () => launchContractorFor(db, nobody, foreign.id)],
      ["read onboarding status", () => onboardingStatusFor(db, nobody, foreign.id)],
      ["read the index", () => onboardingIndexFor(db, nobody)],
    ] as const) ok(`   a non-staff session cannot ${label}`, (await throwsWith(run)) === "NotPlatformStaffError");
    ok(`   signed out cannot attach an owner either`, (await throwsWith(() => attachOwnerFor(db, null, foreign.id, owner.email))) === "NotAuthenticatedError");
    ok(`   staff asking for a contractor that does not exist is refused after authorization`, (await throwsWith(() => attachOwnerFor(db, staff, "no-such-contractor", owner.email))) === "PlatformContractorNotFoundError");
    ok(`   and an id of an implausible shape is refused the same way`, (await throwsWith(() => enrolTradeFor(db, staff, "not a plausible id!", trade))) === "PlatformContractorNotFoundError");

    // ── 2. identity ─────────────────────────────────────────────────────
    ok(`2. a blank name is refused`, (await beginContractorFor(db, staff, { name: "   " })).ok === false);
    ok(`   a bad web address is refused`, ((await beginContractorFor(db, staff, { name: "Probe", slug: "A!" })) as { refusal?: { code: string } }).refusal?.code === "SLUG_INVALID");
    // The probe's own slug is reserved for fixtures. Through the wizard as a
    // person would use it, it is refused; only a declared verifier fixture may
    // carry it — and a declared fixture may carry nothing else.
    ok(`   the probe's reserved slug is refused on the wizard path unless declared a verifier fixture`, ((await beginContractorFor(db, staff, { name: "Probe", slug: SLUG })) as { refusal?: { code: string } }).refusal?.code === "SLUG_INVALID"
      && ((await beginContractorFor(db, staff, { name: "Probe", slug: `genuine-${RUN}` }, { verifierFixture: true })) as { refusal?: { code: string } }).refusal?.code === "SLUG_INVALID"
      && (await raw.contractor.count({ where: { slug: { in: [SLUG, `genuine-${RUN}`] } } })) === 0);
    ok(`   and nothing a person reaches passes the declaration: not the request-bound form, not the wizard's actions`,
      /export const platformBeginContractor = async \(input: \{ name: string; slug\?: string \}\) => beginContractorFor\(prisma, await currentUser\(\), input\);/.test(readFileSync(MODULE, "utf8"))
      && !/verifierFixture/.test(readFileSync("app/platform/onboarding/actions.ts", "utf8")) && !/verifierFixture/.test(strip("lib/contractorCreation.ts").split("export function validateIdentity")[0].split("export function slugProblem")[0])
      && (strip(MODULE).match(/verifierFixture/g) ?? []).length === 0 && (strip(MODULE).match(/IdentityOptions/g) ?? []).length === 2);
    const b1 = await beginContractorFor(db, staff, { name: `Onboarding probe ${RUN}`, slug: SLUG }, { verifierFixture: true });
    ok(`   staff create the contractor`, b1.ok && b1.created && b1.slug === SLUG, JSON.stringify(b1));
    if (!b1.ok) throw new Error("cannot continue without the probe");
    const probeId = b1.contractorId;
    const rows = await raw.contractor.findMany({ where: { slug: SLUG }, select: { id: true, active: true, _count: { select: { memberships: true, sites: true } } } });
    const onboardingRow = await raw.contractorOnboarding.findUnique({ where: { contractorId: probeId }, select: { currentStage: true } });
    ok(`   exactly one row: enabled, one storefront, a guided-setup record, and NO membership`, rows.length === 1 && rows[0].active && rows[0]._count.sites === 1 && rows[0]._count.memberships === 0 && onboardingRow?.currentStage === "business");
    const b2 = await beginContractorFor(db, staff, { name: "Someone else", slug: SLUG }, { verifierFixture: true });
    ok(`   the same address again is SLUG_TAKEN and points at the first, not a second row`, !b2.ok && b2.refusal.code === "SLUG_TAKEN" && b2.existingContractorId === probeId && (await raw.contractor.count({ where: { slug: SLUG } })) === 1);
    const race = await Promise.all([beginContractorFor(db, staff, { name: "Race A", slug: SLUG2 }, { verifierFixture: true }), beginContractorFor(db, staff, { name: "Race B", slug: SLUG2 }, { verifierFixture: true })]);
    const winners = race.filter((r) => r.ok).length;
    ok(`   two concurrent creates of one address: exactly one wins, the other is SLUG_TAKEN naming the winner`, winners === 1 && race.every((r) => r.ok || (r.refusal.code === "SLUG_TAKEN" && r.existingContractorId === (race.find((x) => x.ok) as { contractorId: string }).contractorId)) && (await raw.contractor.count({ where: { slug: SLUG2 } })) === 1, JSON.stringify(race));
    const s0 = await onboardingStatusFor(db, staff, probeId);
    ok(`   progress derives as not-started: identity done, nothing else`, s0.progress === "not-started" && s0.steps[0].status === "done" && s0.steps[1].status === "todo" && s0.owners.length === 0);

    // ── 3. owner ────────────────────────────────────────────────────────
    ok(`3. an address with no account is refused with what to do`, ((await attachOwnerFor(db, staff, probeId, `${EMAIL_PREFIX}${RUN}-nobody@invalid.test`)) as { refusal?: { code: string; message: string } }).refusal?.code === "OWNER_ACCOUNT_NOT_FOUND");
    ok(`   an unverified account is refused`, ((await attachOwnerFor(db, staff, probeId, unverified.email)) as { refusal?: { code: string } }).refusal?.code === "OWNER_NOT_VERIFIED");
    ok(`   a malformed address is refused before any lookup`, ((await attachOwnerFor(db, staff, probeId, "not-an-email")) as { refusal?: { code: string } }).refusal?.code === "EMAIL_INVALID");
    const a1 = await attachOwnerFor(db, staff, probeId, owner.email.toUpperCase());
    const m1 = await raw.contractorMembership.findMany({ where: { contractorId: probeId }, select: { userId: true, role: true, active: true, invitedByUserId: true } });
    ok(`   a verified account becomes the OWNER (address case-folded), invited by the staff member`, a1.ok && !a1.already && m1.length === 1 && m1[0].userId === owner.id && m1[0].role === "OWNER" && m1[0].active && m1[0].invitedByUserId === staff.id);
    const a2 = await attachOwnerFor(db, staff, probeId, owner.email);
    ok(`   attaching the same owner again changes nothing and says so`, a2.ok && a2.already && (await raw.contractorMembership.count({ where: { contractorId: probeId } })) === 1);
    // the second throwaway is owned by `other`; attaching `other` to the probe must refuse under the standing one-business rule
    const raceWinner = race.find((r) => r.ok) as { contractorId: string };
    await raw.contractorMembership.create({ data: { userId: other.id, contractorId: raceWinner.contractorId, role: "OWNER", active: true } });
    ok(`   an account that already owns another business is refused (the standing self-serve rule, kept)`, ((await attachOwnerFor(db, staff, probeId, other.email)) as { refusal?: { code: string } }).refusal?.code === "ALREADY_OWNS_ANOTHER" && (await raw.contractorMembership.count({ where: { contractorId: probeId } })) === 1);
    const s1 = await onboardingStatusFor(db, staff, probeId);
    ok(`   progress re-derives as in-progress with the owner step done`, s1.progress === "in-progress" && s1.steps[1].status === "done" && s1.owners[0].email === owner.email);

    // ── 4. template before trade, then trade ────────────────────────────
    ok(`4. installing before enrolment is refused as NOT_ENROLLED`, ((await installTradeTemplateFor(db, staff, probeId)) as { refusal?: { code: string } }).refusal?.code === "NOT_ENROLLED");
    ok(`   an unpublished trade is refused by the enrolment authority`, ((await enrolTradeFor(db, staff, probeId, `no-such-trade-${RUN}`)) as { refusal?: { code: string } }).refusal?.code === "TRADE_NOT_AVAILABLE");
    const e1 = await enrolTradeFor(db, staff, probeId, trade);
    const e2 = await enrolTradeFor(db, staff, probeId, trade);
    ok(`   enrolling twice is one enrolment`, e1.ok && e2.ok && (await raw.contractorTrade.count({ where: { contractorId: probeId } })) === 1);
    const s2 = await onboardingStatusFor(db, staff, probeId);
    ok(`   progress re-derives with the trade step done and the catalog step open`, s2.progress === "in-progress" && s2.steps[2].status === "done" && s2.steps[3].status === "todo");

    // ── 5. the catalog, through the installer ───────────────────────────
    const [i1, i2] = await Promise.all([installTradeTemplateFor(db, staff, probeId), installTradeTemplateFor(db, staff, probeId)]);
    const installed = await raw.service.count({ where: { contractorId: probeId, templateVersionId: { not: null } } });
    ok(`5. two concurrent installs produce ONE catalog (${installed} services)`, i1.ok && i2.ok && installed > 0 && ("services" in i1 && i1.services === installed) && ("services" in i2 && i2.services === installed));
    const i3 = await installTradeTemplateFor(db, staff, probeId);
    ok(`   a later install is "already", with the same count`, i3.ok && "already" in i3 && i3.already && (await raw.service.count({ where: { contractorId: probeId } })) === installed);
    ok(`   every installed service is INACTIVE — nothing was activated by installing`, (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 0);
    const s3 = await onboardingStatusFor(db, staff, probeId);
    ok(`   the wizard sees the probe's catalog and nothing of the foreign tenant's ${foreignServicesBefore}`, s3.facts.catalog.total === installed && s3.facts.catalog.live === 0);
    ok(`   progress re-derives as blocked: the founder's steps are done, the owner's work remains, and the engine names it`, s3.progress === "blocked" && s3.steps[3].status === "done" && s3.steps[4].status === "blocked" && s3.remaining.length > 0 && s3.remaining.every((b) => b.severity === "blocker"));
    ok(`   the owner's work is described by dashboard PATH, and the status carries no href for a page to render`, s3.ownerWork.every((w) => w.path.startsWith("/dashboard/") && !("href" in w)) && s3.ownerWork.length >= 5);

    // ── 6. launch is governed by the guards ─────────────────────────────
    const l1 = await launchContractorFor(db, staff, probeId);
    ok(`6. launch is refused while the readiness engine names blockers, and lists them`, !l1.ok && "refusal" in l1 && l1.refusal.code === "NOT_READY" && l1.blockers.length === s3.remaining.length);
    ok(`   and activated nothing`, (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 0);
    ok(`   the foreign tenant's services are untouched in count and activation`, (await raw.service.count({ where: { contractorId: foreign.id } })) === foreignServicesBefore && (await raw.service.count({ where: { contractorId: foreign.id, active: true } })) === foreignActiveBefore);

    // ── 6b. a MIXED launch, through the real guards ─────────────────────
    //
    // The owner's work, done on the fixture the way an owner would do it in
    // their dashboard: country, scheduling authority and capacity, a service
    // area, pricing settings, Stripe readiness facts. Two quote-only services
    // are offered — they owe no price — with their material and policy keys
    // resolved, so the readiness engine passes. Then, between the readiness
    // check and service B's activation, B's owner "un-decides" a policy: the
    // seam runs that state change and calls the REAL activateService, which
    // refuses B for real. A is live, B is not: one launch, two outcomes.
    const quoteOnly = await raw.service.findMany({ where: { contractorId: probeId, bookingType: "REMOTE_QUOTE", requiresPreWorkVisit: false }, select: { id: true, slug: true }, orderBy: { name: "asc" }, take: 6 });
    ok(`6b. the catalog has quote-only services to launch (${quoteOnly.length}; using ${quoteOnly.slice(0, 2).map((q) => q.slug).join(", ")})`, quoteOnly.length >= 6);
    const [A, B] = quoteOnly;
    const extra = quoteOnly.slice(2).map((q) => q.id);
    // A counting, timing seam around the REAL guard: every verdict still comes from activationRefusal.
    let guardCalls = 0, inFlight = 0, peak = 0;
    const counting: typeof activationRefusal = async (g, cid, sid) => { guardCalls++; inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 25)); try { return await activationRefusal(g, cid, sid); } finally { inFlight--; } };
    const reset = () => { guardCalls = 0; inFlight = 0; peak = 0; };
    // (i) offered but the owner's work not done: BLOCKED with nothing live → counts read, guards not asked
    await raw.service.updateMany({ where: { id: { in: quoteOnly.map((q) => q.id) } }, data: { offered: true, materialCostResolved: true, unresolvedMaterialKeys: [], unresolvedPolicyKeys: [], depositCents: 0 } });
    reset();
    const sBlocked = await onboardingStatusFor(db, staff, probeId, { refusalFor: counting });
    ok(`   blocked with zero live: offered/live counts are read (6 offered, 0 live) and the guard is asked ZERO times`, sBlocked.progress === "blocked" && sBlocked.launch.pending === 6 && sBlocked.launch.live === 0 && sBlocked.launch.evaluated === false && guardCalls === 0, `calls=${guardCalls}`);
    // (ii) the owner's work done → READY → the guards are evaluated, a few at a time, in order
    await raw.contractor.update({ where: { id: probeId }, data: { countryCode: "US", schedulingAuthority: "NATIVE", nativeConcurrentJobs: 2, stripeAccountId: `acct_probe_${RUN}`, stripeMerchantConfigured: true, stripeCardPaymentsStatus: "active", stripeOnboardingBlocked: false, stripeReadinessCheckedAt: new Date() } });
    await raw.pricingSettings.create({ data: { contractorId: probeId, crewHourRateCents: 15000, primaryMinimumCents: 9900, roundingIncrementCents: 500, defaultPermitAdminCents: 0 } });
    await raw.serviceArea.create({ data: { contractorId: probeId, name: "Probe county", zipCodes: ["30301"], active: true } });
    reset();
    const sReadySix = await onboardingStatusFor(db, staff, probeId, { refusalFor: counting });
    ok(`   ready to launch: the guard is asked once per pending service (6), through the bounded helper — peak in flight ${peak} ≤ ${LAUNCH_GUARD_CONCURRENCY}, and > 1`, sReadySix.progress === "ready" && sReadySix.launch.evaluated && guardCalls === 6 && peak <= LAUNCH_GUARD_CONCURRENCY && peak > 1, `calls=${guardCalls} peak=${peak}`);
    const sReadyAgain = await onboardingStatusFor(db, staff, probeId, { refusalFor: counting });
    const order = (x: typeof sReadySix) => x.launch.offered.map((o) => o.serviceId).join(",");
    const sorted = [...sReadySix.launch.offered].sort((a, b) => a.name.localeCompare(b.name) || a.serviceId.localeCompare(b.serviceId)).map((o) => o.serviceId).join(",");
    ok(`   result order is deterministic: name then id, identical across two reads`, order(sReadySix) === sorted && order(sReadySix) === order(sReadyAgain));
    // back to the two services the mixed launch is about
    await raw.service.updateMany({ where: { id: { in: extra } }, data: { offered: false } });
    reset();
    const sReady = await onboardingStatusFor(db, staff, probeId, { refusalFor: counting });
    ok(`   with the owner's work done the readiness engine passes and progress derives as READY (not launched: nothing is live)`, sReady.facts.readiness.canLaunch && sReady.progress === "ready" && sReady.launch.live === 0 && sReady.launch.pending === 2, sReady.remaining.map((b) => b.code).join(",") || "no blockers");
    ok(`   and each pending service's guard verdict is visible before launch: both allowed (2 guard calls)`, sReady.launch.evaluated && guardCalls === 2 && sReady.launch.offered.every((o) => !o.live && o.refusal === null));
    const interposed: typeof activateService = async (g, cid, sid) => {
      if (sid === B.id) await raw.service.update({ where: { id: B.id }, data: { unresolvedPolicyKeys: ["probe.undecided.policy"] } });
      return activateService(g, cid, sid);
    };
    const mixed = await launchContractorFor(db, staff, probeId, { activate: interposed });
    const outcomeOf = (id: string) => ("outcomes" in mixed ? mixed.outcomes.find((o) => o.serviceId === id) : undefined);
    ok(`   the launch reports ONE activated and ONE refused — by the real guard, with its code`, "activated" in mixed && !mixed.ok && mixed.activated === 1 && mixed.refused === 1 && mixed.failed === 0 && outcomeOf(A.id)?.outcome === "activated" && outcomeOf(B.id)?.outcome === "refused" && outcomeOf(B.id)?.code === "POLICY_UNRESOLVED", JSON.stringify(mixed).slice(0, 300));
    ok(`   and the rows agree: A live, B not`, (await raw.service.findUniqueOrThrow({ where: { id: A.id }, select: { active: true } })).active && !(await raw.service.findUniqueOrThrow({ where: { id: B.id }, select: { active: true } })).active);
    reset();
    const sMixed = await onboardingStatusFor(db, staff, probeId, { refusalFor: counting });
    ok(`   after the redirect the outcomes are still visible, derived: A live, B not live with the guard's current refusal`, sMixed.launch.live === 1 && sMixed.launch.pending === 1 && sMixed.launch.offered.find((o) => o.serviceId === A.id)?.live === true && sMixed.launch.offered.find((o) => o.serviceId === B.id)?.refusal?.code === "POLICY_UNRESOLVED");
    ok(`   a partial launch evaluates only the PENDING service (1 guard call), even though progress is blocked, so its refusal stays visible`, sMixed.launch.evaluated && guardCalls === 1);
    ok(`   progress is NOT "launched" while an offered service is pending — it is blocked, because the engine now names B's policy`, sMixed.progress === "blocked" && !sMixed.facts.readiness.canLaunch && sMixed.remaining.some((b) => b.code === "POLICY_UNRESOLVED"));
    ok(`   a retry while blocked is refused by the readiness gate and changes nothing`, (() => true)() && (await launchContractorFor(db, staff, probeId)).ok === false && (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 1);
    // the owner decides the policy; the wizard re-derives; the founder retries through the same guard
    await raw.service.update({ where: { id: B.id }, data: { unresolvedPolicyKeys: [] } });
    const sRetry = await onboardingStatusFor(db, staff, probeId);
    ok(`   once the blocker is cleared, progress derives as READY again with the retry path open (1 live, 1 pending)`, sRetry.progress === "ready" && sRetry.launch.live === 1 && sRetry.launch.pending === 1 && sRetry.steps[5].status === "todo");
    const retry = await launchContractorFor(db, staff, probeId);
    ok(`   the retry activates B through activateService and reports A as already live`, "activated" in retry && retry.ok && retry.activated === 1 && outcomeOfRetry(retry, A.id) === "already-live" && outcomeOfRetry(retry, B.id) === "activated");
    const sDone = await onboardingStatusFor(db, staff, probeId);
    ok(`   and only now is progress "launched": every offered service live, none pending`, sDone.progress === "launched" && sDone.launch.live === 2 && sDone.launch.pending === 0 && sDone.steps[5].status === "done");
    ok(`   nothing beyond the two offered services went live, and no price was invented`, (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 2 && (await raw.service.count({ where: { id: { in: [A.id, B.id] }, OR: [{ basePrice: { not: null } }, { publishedPriceApprovedAt: { not: null } }] } })) === 0);

    // ── 6c. retire: the reversible delete ───────────────────────────────
    const before = { services: await raw.service.count({ where: { contractorId: probeId } }), materials: await raw.contractorMaterial.count({ where: { contractorId: probeId } }).catch(() => -1), memberships: await raw.contractorMembership.count({ where: { contractorId: probeId } }) };
    const wrong = await retireContractorFor(db, staff, probeId, "not-the-slug");
    ok(`6c. retiring with the wrong web address typed is refused and changes nothing`, !wrong.ok && wrong.refusal.code === "CONFIRMATION_MISMATCH" && (await raw.contractor.findUniqueOrThrow({ where: { id: probeId }, select: { active: true } })).active && (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 2);
    ok(`   a non-staff session cannot retire`, (await throwsWith(() => retireContractorFor(db, owner, probeId, SLUG))) === "NotPlatformStaffError");
    const r1 = await retireContractorFor(db, staff, probeId, SLUG.toUpperCase());
    const afterRow = await raw.contractor.findUniqueOrThrow({ where: { id: probeId }, select: { active: true, _count: { select: { sites: true } } } });
    ok(`   with the slug typed (case-folded), the business, its storefront and both live services go inactive in one step`, r1.ok && !r1.already && r1.servicesDeactivated === 2 && r1.sitesDeactivated === 1 && !afterRow.active && (await raw.contractorSite.count({ where: { contractorId: probeId, active: true } })) === 0 && (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 0);
    ok(`   and NOTHING was deleted: services, materials and memberships are all still there`, (await raw.service.count({ where: { contractorId: probeId } })) === before.services && (await raw.contractorMaterial.count({ where: { contractorId: probeId } }).catch(() => -1)) === before.materials && (await raw.contractorMembership.count({ where: { contractorId: probeId } })) === before.memberships && afterRow._count.sites === 1);
    const r2 = await retireContractorFor(db, staff, probeId, SLUG);
    ok(`   retiring again is one retire`, r2.ok && r2.already && r2.servicesDeactivated === 0);
    const sRetired = await onboardingStatusFor(db, staff, probeId);
    ok(`   progress derives as RETIRED from Contractor.active, and the facts still read through the door`, sRetired.progress === "retired" && sRetired.facts.contractor.active === false && sRetired.facts.catalog.live === 0);
    ok(`   a retired contractor is nobody's job: the attention rule yields nothing for it`, attentionFor(sRetired.facts).length === 0);
    const idxR = await onboardingIndexFor(db, staff, { fixtures: "show" });
    ok(`   and the index lists it as retired`, idxR.rows.some((r) => r.id === probeId && r.readable && r.progress === "retired"));
    // The probe is a verifier fixture (lib/fixtureContractors). The index a
    // person sees leaves it out and says so — a fixture listed as a business
    // to onboard is how one leaked into production on 7 Sep 2026.
    const idxStaff = await onboardingIndexFor(db, staff);
    ok(`   by default the index leaves verifier fixtures out and reports how many`, !idxStaff.rows.some((r) => r.id === probeId) && idxStaff.hiddenFixtures >= 1 && idxR.hiddenFixtures === 0 && idxStaff.rows.length === idxR.rows.length - idxStaff.hiddenFixtures);
    ok(`   the request-bound form passes nothing, so the page can never list one`, /export const platformOnboardingIndex = async \(\) => onboardingIndexFor\(prisma, await currentUser\(\)\);/.test(readFileSync(MODULE, "utf8")));

    // ── 7. the index derives every row, isolating failures ──────────────
    const idx = await onboardingIndexFor(db, staff, { fixtures: "show" });
    const mine = idx.rows.find((r) => r.id === probeId);
    // `other` is never this contractor's owner: the one-owned-business
    // rule (restored above) refused attaching it at line ~241, because it
    // already owns the race-winner contractor. One owner, unambiguously.
    ok(`7. the index lists the probe with its derived progress (retired, after 6c) and its one owner`, !!mine && mine.readable && mine.progress === "retired" && mine.owners.includes(owner.email) && !mine.owners.includes(other.email) && mine.owners.length === 1);
    ok(`   and the progress rule itself, on synthetic facts`,
      onboardingProgress({ contractor: { active: false }, catalog: { total: 5, live: 5 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 1, 0) === "retired"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 0, live: 0 }, readiness: { canLaunch: false }, trades: [] }, 0) === "not-started"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 0, live: 0 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 0) === "in-progress"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 0 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 1) === "blocked"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 0 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 1) === "ready"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 2 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 1, 0) === "launched"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 0 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 0) === "in-progress"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 1 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 1, 1) === "ready"
      && onboardingProgress({ contractor: { active: true }, catalog: { total: 5, live: 1 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 1, 1) === "blocked");
    ok(`   notices voice only known codes and refusal-shaped codes, never free text`, noticeText("CREATED")?.tone === "ok" && noticeText("SLUG_TAKEN")?.tone === "warn" && noticeText("<script>") === null && noticeText(42) === null && noticeText("a".repeat(60)) === null);
  } finally {
    await teardown();
  }

  // ── 8. cleanup, proven ────────────────────────────────────────────────
  ok(`8. every fixture is gone: contractors, memberships, trades, services, users`,
    (await raw.contractor.count({ where: { slug: { in: [SLUG, SLUG2] } } })) === 0
    && (await raw.contractorMembership.count({ where: { userId: { in: [owner.id, other.id] } } })) === 0
    && (await raw.user.count({ where: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } } })) === 0);

  // ── 9. structure, by syntax tree ─────────────────────────────────────
  const src = readFileSync(MODULE, "utf8"); const mod = strip(MODULE);
  const violations = importViolations(src, ONBOARDING_POLICY, MODULE);
  ok(`9. the command module imports only its allowlisted authorities (module and symbol)`, violations.length === 0, violations.join("; "));
  const outside = writesOutsideDoors(src);
  ok(`   every mutating call in it is inside a platform door's callback`, outside.length === 0, outside.join(", "));
  const writes = mutatingCalls(src, MODULE).map((w) => w.callee);
  // Phase 3A added three call sites: attachOwnerFor's grant now runs inside
  // its own ownership-locked transaction (still `db.$transaction`, matched by
  // the same pattern as retire's); inviteOwnerFor's revoke-and-replace runs
  // in one transaction that both updates the superseded row and creates the
  // new one; revokeInvitationFor writes its own single update, deliberately
  // OUTSIDE any transaction (there is nothing else to make atomic with it).
  const OWNED_WRITES = [
    /platformDb\.\$transaction/, /contractorMembership\.upsert/, /^db\.\$transaction$/,
    /db\.contractor\.update$/, /db\.contractorSite\.updateMany/, /db\.service\.updateMany/,
    /contractorInvitation\.(update|create)/,
  ];
  ok(`   and the only writes it owns are the tenant transaction, the owner membership upsert (now lock-guarded), invitation mint/resend/revoke, and retire's one transaction of three deactivations (${writes.join(", ")})`,
    writes.length === 11 && OWNED_WRITES.every((re) => writes.some((w) => re.test(w))) && writes.every((w) => OWNED_WRITES.some((re) => re.test(w))));
  const retire = fnBody(src, "retireContractorFor");
  ok(`   retire deletes nothing, writes only \`active: false\`, and demands the slug typed back before it reads anything`, !/\.delete\(|\.deleteMany\(|\$executeRaw/.test(retire) && !/data:\s*\{[^}]*\bactive: true/.test(retire) && (retire.match(/active: false/g) ?? []).length === 3 && retire.indexOf("CONFIRMATION_MISMATCH") < retire.indexOf("findUniqueOrThrow") && /confirmSlug\.trim\(\)\.toLowerCase\(\) !== contractor\.slug/.test(retire));
  ok(`   it never constructs a client, reads PlatformAccess, or authorizes by email`, !/new PrismaClient|platformAccess|\.email\s*[!=]==?/.test(mod));
  ok(`   it reads no request: no next/headers or next/server, no params, searchParams or arguments`, !/\bparams\b|searchParams|\barguments\b|next\/headers|next\/server/.test(mod));
  const install = fnBody(src, "installOnce") + fnBody(src, "installTradeTemplateFor");
  ok(`   installation runs preflight and installCatalog, and never touches activation`, /templateVersionSource\(/.test(install) && /preflight\(/.test(install) && /installCatalog\(db, contractor\.id, pre\.catalog\)/.test(install) && !/activateService|data:\s*\{[^}]*active|\.update\(/.test(install));
  const launch = fnBody(src, "launchContractorFor");
  ok(`   launch asks assessOnboarding first and refuses on blockers before any activation`, /assessOnboarding\(guarded, contractor\.id\)/.test(launch) && launch.indexOf("canLaunch") < launch.indexOf("activate(") && /NOT_READY/.test(launch));
  ok(`   and activates only through activateService, never by writing active`, callsTo(src, "activate").length === 1 && /const activate = opts\.activate \?\? activateService;/.test(src) && !/\.update\(|data:\s*\{[^}]*active/.test(launch) && !/service\.update\(/.test(mod) && !/data:\s*\{[^}]*\bactive: true/.test(mod.replace(/contractorMembership\.upsert\([\s\S]*?\}\);/g, "")));
  ok(`   the activation seam defaults to the genuine import, the readiness gate is not injectable, and the request-bound form passes nothing`,
    /opts: \{ activate\?: Activate \} = \{\}/.test(src) && !/opts\.(assess|readiness|canLaunch)/.test(src) && /launchContractorFor\(prisma, await currentUser\(\), contractorId\);/.test(src) && !/launchContractorFor/.test(readFileSync("app/platform/onboarding/actions.ts", "utf8")));
  ok(`   guard verdicts are read through the bounded helper with a small bound, never a sequential loop, and the seam defaults to the genuine guard`,
    /mapWithConcurrency\(base\.filter\(\(x\) => !x\.live\), LAUNCH_GUARD_CONCURRENCY/.test(fnBody(src, "launchStateFor")) && LAUNCH_GUARD_CONCURRENCY <= 3 && !/for \(const .* of .*\)[^\n]*\n[^\n]*refusalFor/.test(fnBody(src, "launchStateFor"))
    && /const refusalFor = opts\.refusalFor \?\? activationRefusal;/.test(src) && /onboardingStatusFor\(prisma, await currentUser\(\), contractorId\);/.test(src) && !/refusalFor/.test(readFileSync("app/platform/onboarding/actions.ts", "utf8") + readFileSync("app/platform/onboarding/[contractorId]/page.tsx", "utf8")));
  ok(`   and verdicts are skipped exactly when nothing is live and the contractor is not ready`, /const detail = live > 0 \|\| progress === "ready";/.test(src) && /if \(!detail \|\| pending === 0\) return \{ offered: base, live, pending, evaluated: false \};/.test(src));
  ok(`   launch state is read from activationRefusal — the guard's verdict, never a stored copy`, /refusalFor\(guarded, contractorId, x\.serviceId\)/.test(fnBody(src, "launchStateFor")) && !/launchedAt|launchOutcome|lastLaunch/.test(mod) && !/launchedAt|launchOutcome|lastLaunch/.test(strip("prisma/schema.prisma")));
  ok(`   there is one readiness engine: the module never computes canLaunch or a blocker of its own`, !/canLaunch:\s*(true|false|!?[\w.]*blockers)/.test(mod) && !/severity:\s*"blocker"/.test(mod) && /assessOnboarding\(/.test(mod) && /contractorFactsFor\(db, user, contractorId\)/.test(mod));
  ok(`   completedAt is never stamped — finishing is derived, not declared`, !/completedAt:/.test(mod));
  const surfaces = sourceFiles(["app/platform/onboarding"]);
  ok(`   the wizard's pages and actions exist`, surfaces.length === 3, surfaces.join(", "));
  const surfaceWrites = surfaces.flatMap((f) => mutatingCalls(readFileSync(f, "utf8"), f).map((w) => `${f}:${w.callee}`));
  ok(`   no page or action makes a mutating call`, surfaceWrites.length === 0, surfaceWrites.join("; "));
  ok(`   no page or action imports a Prisma client, the contractor boundary, or the read model's doors`, surfaces.every((f) => !/from "@\/lib\/prisma"|adminContext|withPlatformContractor|withPlatformFor|PrismaClient/.test(strip(f))));
  const actions = readFileSync("app/platform/onboarding/actions.ts", "utf8");
  ok(`   the actions never pass their FormData onward — fields are read in place`, requestAccess(actions, "app/platform/onboarding/actions.ts").length === 0 && usesOf(actions, "formData", "app/platform/onboarding/actions.ts").every((u) => u.kind === "member" && u.member === "get"));
  ok(`   every redirect carries the id the COMMAND returned, or the form's id only back to the same page`, /backTo\(r\.contractorId/.test(actions) && !/redirect\(`\/platform\/onboarding\/\$\{field/.test(actions));
  ok(`   launch and retire each demand an explicit confirmation, and retire also the slug typed back`, (actions.match(/confirm"\)+ !== "yes"/g) ?? []).length === 2 && /CONFIRMATION_REQUIRED/.test(actions) && /platformRetireContractor\(str\(formData\.get\("contractorId"\)\), str\(formData\.get\("confirmSlug"\)\)\)/.test(actions));
  // ── 10. the wizard never navigates the operator into an unscoped dashboard ──
  //
  // /dashboard/* resolves its contractor from the signed-in user's membership
  // and cookie, not from the page that linked it. A founder who owns a
  // business, clicking from another contractor's wizard, would land in their
  // OWN business's editors. So every href the wizard renders must be a literal
  // or template that starts under /platform; a dynamic href, or anything
  // under /dashboard, is refused — by syntax tree, for every onboarding page.
  const pages = sourceFiles(["app/platform/onboarding"]).filter((f) => f.endsWith(".tsx"));
  const hrefs = pages.flatMap((f) => hrefsIn(f).map((h) => ({ f, ...h })));
  const badHrefs = hrefs.filter((h) => !h.text.startsWith("/platform/"));
  ok(`10. every href the wizard renders is a literal under /platform — none dynamic, none to /dashboard (${hrefs.length} hrefs checked)`, hrefs.length >= 4 && badHrefs.length === 0, badHrefs.map((h) => `${h.f}:${h.line} ${h.text}`).join("; "));
  ok(`   the readiness findings' own dashboard hrefs are shown as text, never rendered as links`, /owner&rsquo;s dashboard: <code>\{b\.href\}<\/code>/.test(readFileSync("app/platform/onboarding/[contractorId]/page.tsx", "utf8")) && !/href=\{b\.href\}|href=\{w\.path\}|href=\{l\.href\}/.test(readFileSync("app/platform/onboarding/[contractorId]/page.tsx", "utf8")));
  ok(`   mutant: a dynamic href would be caught`, (() => { const probe = "mutant.tsx"; const src = 'export default function P({ s }: { s: { href: string } }) { return <a href={s.href}>x</a>; }'; const sf = ts.createSourceFile(probe, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let dyn = 0; const v = (n: ts.Node) => { if (ts.isJsxAttribute(n) && ts.isIdentifier(n.name) && n.name.text === "href" && n.initializer && ts.isJsxExpression(n.initializer) && n.initializer.expression && !ts.isStringLiteral(n.initializer.expression)) dyn++; ts.forEachChild(n, v); }; v(sf); return dyn === 1; })());

  // ── 11. one slug authority ─────────────────────────────────────────────
  const slugOf = (input: { name: string; slug?: string }) => { const r = validateIdentity(input); return r.ok ? r.slug : `refused:${r.refusal.code}`; };
  ok(`11. an ordinary address is accepted`, slugOf({ name: "Northside Electric", slug: "northside-electric" }) === "northside-electric");
  ok(`   the platform's reserved words are refused by creation exactly as routing refuses them`, ["api", "dashboard", "onboarding", "sign-in", "www"].every((w) => slugOf({ name: "X", slug: w }) === "refused:SLUG_INVALID" && hostedSlugProblem(w) !== null));
  ok(`   consecutive hyphens are refused`, slugOf({ name: "X", slug: "north--side" }) === "refused:SLUG_INVALID" && hostedSlugProblem("north--side") !== null);
  // lib/fixtureContractors: a slug that marks a verifier fixture can never be
  // a person's, on either creation path, so the fixture rule is exact.
  ok(`   the prefixes reserved for verifier fixtures are refused, by the same authority, on both creation paths`,
    FIXTURE_SLUG_PREFIXES.every((p) => isFixtureContractorSlug(`${p}electric`)) && FIXTURE_SLUG_PREFIXES.filter((p) => hostedSlugProblem(`${p}electric`) === null).every((p) => slugOf({ name: "X", slug: `${p}electric` }) === "refused:SLUG_INVALID")
      && slugOf({ name: "Test Electric" }) === "refused:SLUG_INVALID" && slugOf({ name: "X", slug: "testing-electric" }) === "testing-electric" && !isFixtureContractorSlug("testing-electric") && /fixtureSlugProblem/.test(strip("lib/contractorCreation.ts")));
  ok(`   boundaries: leading or trailing hyphen, two characters, and 49 characters are refused; 3 and 48 are accepted`,
    slugOf({ name: "X", slug: "-abc" }) === "refused:SLUG_INVALID" && slugOf({ name: "X", slug: "abc-" }) === "refused:SLUG_INVALID" && slugOf({ name: "X", slug: "ab" }) === "refused:SLUG_INVALID"
    && slugOf({ name: "X", slug: "a".repeat(SLUG_MAX + 1) }) === "refused:SLUG_INVALID" && slugOf({ name: "X", slug: "abc" }) === "abc" && slugOf({ name: "X", slug: "a".repeat(SLUG_MAX) }) === "a".repeat(SLUG_MAX));
  ok(`   a generated address obeys the same rule: "Dashboard" is refused, a long name never ends on a hyphen, an ordinary name slugifies cleanly`,
    slugOf({ name: "Dashboard" }) === "refused:SLUG_INVALID" && slugify("Dashboard") === "dashboard"
    && !/-$/.test(slugify("North Side Electric And Lighting Contractors Of Greater X")) && slugify("North Side Electric And Lighting Contractors Of Greater X").length <= SLUG_MAX
    && slugOf({ name: "North Side Electric!" }) === "north-side-electric" && slugOf({ name: "O'Brien & Sons" }) === "obrien-sons");
  ok(`   creation's rule IS hostedSlugProblem plus a shorter ceiling — no second reserved list`, /hostedSlugProblem\(slug\)/.test(strip("lib/contractorCreation.ts")) && !/RESERVED|reserved = \[|new Set\(\[/.test(strip("lib/contractorCreation.ts").replace(/hostedSlugProblem/g, "")) && !/SLUG_SHAPE/.test(strip("lib/contractorCreation.ts")));
  ok(`   the create form's HTML pattern is the shared constant and agrees with the server on shape`, /pattern=\{SLUG_INPUT_PATTERN\}/.test(readFileSync("app/platform/onboarding/page.tsx", "utf8")) && (() => { const re = new RegExp(`^(?:${SLUG_INPUT_PATTERN})$`); return re.test("northside-electric") && re.test("abc") && !re.test("north--side") && !re.test("-abc") && !re.test("abc-") && !re.test("ab") && !re.test("a".repeat(SLUG_MAX + 1)) && re.test("a".repeat(SLUG_MAX)); })());

  // Reads verify:full — Development Release Mode (7 Sep) moved the literal
  // chain text off `verify` (now an alias) onto this key. Same ordering
  // invariant, same field content, different name.
  const chain = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts["verify:full"];
  ok(`   this verifier runs in the deploy gate, after the read model's`, chain.indexOf("verify-platform-read-model.ts") < chain.indexOf("verify-platform-onboarding.ts"));

  console.log(fail ? `\n  ${fail} check(s) failed.\n` : `\n  The founder may act. Only through the door, and only by handing the decision to whoever already owns it.\n`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => raw.$disconnect());
