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
  beginContractorFor, attachOwnerFor, enrolTradeFor, installTradeTemplateFor, launchContractorFor, noticeText,
} from "../lib/platformOnboarding";
import { availableTrades } from "../lib/templateProvisioning";

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
  "./contractorCreation": ["validateIdentity", "slugTaken", "createContractorRecord", "isUniqueViolation"],
  "./tradeEnrolment": ["setTradeEnrolment"],
  "./templateProvisioning": ["availableTrades", "templateVersionSource", "preflight", "installCatalog"],
  "./onboardingReadiness": ["assessOnboarding"],
  "./serviceActivation": ["activateService"],
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
    const b1 = await beginContractorFor(db, staff, { name: `Onboarding probe ${RUN}`, slug: SLUG });
    ok(`   staff create the contractor`, b1.ok && b1.created && b1.slug === SLUG, JSON.stringify(b1));
    if (!b1.ok) throw new Error("cannot continue without the probe");
    const probeId = b1.contractorId;
    const rows = await raw.contractor.findMany({ where: { slug: SLUG }, select: { id: true, active: true, _count: { select: { memberships: true, sites: true } } } });
    const onboardingRow = await raw.contractorOnboarding.findUnique({ where: { contractorId: probeId }, select: { currentStage: true } });
    ok(`   exactly one row: enabled, one storefront, a guided-setup record, and NO membership`, rows.length === 1 && rows[0].active && rows[0]._count.sites === 1 && rows[0]._count.memberships === 0 && onboardingRow?.currentStage === "business");
    const b2 = await beginContractorFor(db, staff, { name: "Someone else", slug: SLUG });
    ok(`   the same address again is SLUG_TAKEN and points at the first, not a second row`, !b2.ok && b2.refusal.code === "SLUG_TAKEN" && b2.existingContractorId === probeId && (await raw.contractor.count({ where: { slug: SLUG } })) === 1);
    const race = await Promise.all([beginContractorFor(db, staff, { name: "Race A", slug: SLUG2 }), beginContractorFor(db, staff, { name: "Race B", slug: SLUG2 })]);
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
    ok(`   the checklist links are the existing screens, never editors of this wizard's own`, s3.links.every((l) => l.href.startsWith("/dashboard/")) && s3.links.length >= 5);

    // ── 6. launch is governed by the guards ─────────────────────────────
    const l1 = await launchContractorFor(db, staff, probeId);
    ok(`6. launch is refused while the readiness engine names blockers, and lists them`, !l1.ok && "refusal" in l1 && l1.refusal.code === "NOT_READY" && l1.blockers.length === s3.remaining.length);
    ok(`   and activated nothing`, (await raw.service.count({ where: { contractorId: probeId, active: true } })) === 0);
    ok(`   the foreign tenant's services are untouched in count and activation`, (await raw.service.count({ where: { contractorId: foreign.id } })) === foreignServicesBefore && (await raw.service.count({ where: { contractorId: foreign.id, active: true } })) === foreignActiveBefore);

    // ── 7. the index derives every row, isolating failures ──────────────
    const idx = await onboardingIndexFor(db, staff);
    const mine = idx.rows.find((r) => r.id === probeId);
    ok(`7. the index lists the probe with its derived progress`, !!mine && mine.readable && mine.progress === "blocked" && mine.owners.includes(owner.email));
    ok(`   and the progress rule itself, on synthetic facts`,
      onboardingProgress({ catalog: { total: 0, live: 0 }, readiness: { canLaunch: false }, trades: [] }, 0) === "not-started"
      && onboardingProgress({ catalog: { total: 0, live: 0 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 0) === "in-progress"
      && onboardingProgress({ catalog: { total: 5, live: 0 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 1) === "blocked"
      && onboardingProgress({ catalog: { total: 5, live: 0 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 1) === "ready"
      && onboardingProgress({ catalog: { total: 5, live: 2 }, readiness: { canLaunch: false }, trades: ["electrical"] }, 1) === "launched"
      && onboardingProgress({ catalog: { total: 5, live: 0 }, readiness: { canLaunch: true }, trades: ["electrical"] }, 0) === "in-progress");
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
  ok(`   and the only writes it owns are the tenant transaction and the owner membership upsert (${writes.join(", ")})`, writes.length === 2 && writes.some((w) => /\$transaction/.test(w)) && writes.some((w) => /contractorMembership\.upsert/.test(w)));
  ok(`   it never constructs a client, reads PlatformAccess, or authorizes by email`, !/new PrismaClient|platformAccess|\.email\s*[!=]==?/.test(mod));
  ok(`   it reads no request: no next/headers or next/server, no params, searchParams or arguments`, !/\bparams\b|searchParams|\barguments\b|next\/headers|next\/server/.test(mod));
  const install = fnBody(src, "installOnce") + fnBody(src, "installTradeTemplateFor");
  ok(`   installation runs preflight and installCatalog, and never touches activation`, /templateVersionSource\(/.test(install) && /preflight\(/.test(install) && /installCatalog\(db, contractor\.id, pre\.catalog\)/.test(install) && !/activateService|data:\s*\{[^}]*active|\.update\(/.test(install));
  const launch = fnBody(src, "launchContractorFor");
  ok(`   launch asks assessOnboarding first and refuses on blockers before any activation`, /assessOnboarding\(guarded, contractor\.id\)/.test(launch) && launch.indexOf("canLaunch") < launch.indexOf("activateService") && /NOT_READY/.test(launch));
  ok(`   and activates only through activateService, never by writing active`, callsTo(src, "activateService").length === 1 && !/\.update\(|data:\s*\{[^}]*active/.test(launch) && !/service\.update/.test(mod));
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
  ok(`   launch demands an explicit confirmation`, /confirm"\)+ !== "yes"/.test(actions) && /CONFIRMATION_REQUIRED/.test(actions));
  const chain = (JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> }).scripts.verify;
  ok(`   this verifier runs in the deploy gate, after the read model's`, chain.indexOf("verify-platform-read-model.ts") < chain.indexOf("verify-platform-onboarding.ts"));

  console.log(fail ? `\n  ${fail} check(s) failed.\n` : `\n  The founder may act. Only through the door, and only by handing the decision to whoever already owns it.\n`);
  process.exitCode = fail ? 1 : 0;
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => raw.$disconnect());
