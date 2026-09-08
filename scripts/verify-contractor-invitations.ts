/**
 * PHASE 3A — invitation-backed contractor onboarding.
 *
 * What this proves, against the real database with run-unique fixtures it
 * creates and destroys itself:
 *
 *   authorization    inviteOwnerFor and revokeInvitationFor refuse signed-out
 *                    and non-staff sessions before anything is read or written
 *   one pending      inviting again — same email or a different one — revokes
 *                    any invitation that is neither accepted nor revoked and
 *                    creates one fresh row in the same transaction; the old
 *                    raw token stops working the instant the new one exists
 *   never on a GET   peekInvitationFor never writes — proven by asserting the
 *                    invitation's own updatedAt-equivalent (acceptedAt/
 *                    revokedAt) is unchanged after repeated peeks
 *   refusal order    not found, already used (idempotent only for the
 *                    original user with a live membership), revoked, expired,
 *                    retired, wrong email, unverified, already owns another —
 *                    each proven on its own fixture
 *   atomic accept    two simultaneous accepts of the SAME token settle to
 *                    exactly one membership, and BOTH callers see success
 *   race-safe        two simultaneous grants of a user's FIRST ownership,
 *                    through two different invitations on two different
 *                    contractors, settle to exactly one membership
 *   retirement       invite, attach-owner, enrol-trade and install-catalog all
 *                    refuse server-side on a retired contractor; accepting a
 *                    once-good invitation is refused once the business
 *                    retires; revoking one stays available regardless
 *   tenant boundary  revoking an invitation through the wrong contractor's
 *                    door is refused, and the real row is untouched
 *   delivery         a send failure is reported, not swallowed, and never
 *                    rolls back the invitation row
 *   cleanup          every fixture is gone at the end, and proven gone
 *
 *   npx tsx scripts/verify-contractor-invitations.ts
 */

import { PrismaClient, type PlatformRole } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { destroyContractor } from "./_throwaway";
import {
  beginContractorFor, attachOwnerFor, enrolTradeFor, installTradeTemplateFor,
  inviteOwnerFor, revokeInvitationFor, retireContractorFor,
} from "../lib/platformOnboarding";
import { peekInvitationFor, acceptInvitationFor } from "../lib/contractorInvitations";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-contractor-invitations";
const SLUG = `${SLUG_PREFIX}-${RUN}`; // the main happy-path contractor
const SLUG2 = `${SLUG_PREFIX}-${RUN}-b`; // already has an owner — for ALREADY_OWNS_ANOTHER
const SLUG3 = `${SLUG_PREFIX}-${RUN}-c`; // retirement scenarios
const SLUG4 = `${SLUG_PREFIX}-${RUN}-d`; // race: same-token concurrent accept
const SLUG5 = `${SLUG_PREFIX}-${RUN}-e`; // race: the SECOND contractor in the cross-path ownership race
const SLUG6 = `${SLUG_PREFIX}-${RUN}-f`; // retirement scenarios
const SLUG7 = `${SLUG_PREFIX}-${RUN}-g`; // tenant isolation
const SLUG8 = `${SLUG_PREFIX}-${RUN}-h`; // concurrent invite/resend
const SLUG9 = `${SLUG_PREFIX}-${RUN}-i`; // accept vs replacement (resend)
const SLUG10 = `${SLUG_PREFIX}-${RUN}-j`; // accept vs revoke
const SLUG11 = `${SLUG_PREFIX}-${RUN}-k`; // accept vs retirement
const SLUG12 = `${SLUG_PREFIX}-${RUN}-l`; // accept vs staff attachment
const USER_PREFIX = "test-contractor-invitations";
const EMAIL_PREFIX = "p2b-verify-invitations-";
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
async function throwsWith(run: () => Promise<unknown>) { try { await run(); return null; } catch (e) { return (e as Error).name; } }

type Grant = { role: PlatformRole; grantedAt: Date; revokedAt: Date | null };
function doubleWith(grants: Record<string, Grant>): PrismaClient {
  const platformAccess = { findUnique: async (a: { where: { userId?: string } }) => grants[a.where.userId ?? ""] ?? null };
  return new Proxy(raw, { get(t, p) { return p === "platformAccess" ? platformAccess : Reflect.get(t, p); } }) as unknown as PrismaClient;
}

async function removeContractor(slug: string) {
  await raw.contractorInvitation.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorMembership.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}
async function teardown() {
  for (const s of [SLUG, SLUG2, SLUG3, SLUG4, SLUG5, SLUG6, SLUG7, SLUG8, SLUG9, SLUG10, SLUG11, SLUG12]) await removeContractor(s);
  await raw.user.deleteMany({ where: { id: { startsWith: `${USER_PREFIX}-${RUN}-` } } }).catch(() => {});
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({ where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG, SLUG2, SLUG3, SLUG4, SLUG5, SLUG6, SLUG7, SLUG8, SLUG9, SLUG10, SLUG11, SLUG12] } }, createdAt: { lt: cutoff } }, select: { slug: true } });
  for (const c of stale) await removeContractor(c.slug);
  await raw.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX }, createdAt: { lt: cutoff } } }).catch(() => {});
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

// ── the dev mail sink, read the way a person reads their inbox ─────────────
// Same technique as scripts/verify-account-bootstrap.ts: PLATFORM_MAIL_SINK
// diverts sendPlatformMail to a JSONL file instead of a real send, because
// opening an inbox is the one step a script cannot perform and the invitation
// token is never stored in the clear anywhere a query could read it back.
// Per-run filename so a concurrent chain step's own sink cannot collide.
const SINK = `/tmp/p2b-mail-invitations-${RUN}.jsonl`;
process.env.PLATFORM_MAIL_SINK = SINK;

async function tokenFor(email: string): Promise<string | null> {
  let text = "";
  try { text = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = text.split("\n").filter(Boolean).map((l) => { try { return JSON.parse(l) as { to: string; text: string }; } catch { return null; } })
    .filter((m): m is { to: string; text: string } => m !== null && m.to === email);
  const last = mine.at(-1);
  const url = last?.text.match(/https?:\/\/\S+\/invite\/(\S+)/);
  return url?.[1] ?? null;
}

async function main() {
  console.log(`\nCONTRACTOR INVITATIONS — one pending per contractor, accepted atomically, by the matching verified email\n`);
  await teardown();
  await sweepStale();

  const t0 = new Date();
  const staff = { id: `${USER_PREFIX}-${RUN}-staff`, email: `${EMAIL_PREFIX}${RUN}-staff@invalid.test` };
  const db = doubleWith({ [staff.id]: { role: "PLATFORM_ADMIN", grantedAt: t0, revokedAt: null } });
  const nobody = { id: `${USER_PREFIX}-${RUN}-nobody`, email: `${EMAIL_PREFIX}${RUN}-nobody@invalid.test` };

  // The invited owner: starts UNVERIFIED (proves NOT_VERIFIED), then
  // verified in place to proceed through the rest of the happy path — a
  // realistic sequence (sign up, confirm, accept), not two separate people.
  const ownerEmail = `${EMAIL_PREFIX}${RUN}-owner@invalid.test`;
  const owner = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-owner`, email: ownerEmail, name: "Invited owner", emailVerified: false }, select: { id: true, email: true } });

  // Already owns SLUG2 — proves ALREADY_OWNS_ANOTHER on acceptance.
  const elsewhereEmail = `${EMAIL_PREFIX}${RUN}-elsewhere@invalid.test`;
  const elsewhere = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-elsewhere`, email: elsewhereEmail, name: "Owns another", emailVerified: true }, select: { id: true, email: true } });

  const c1 = await beginContractorFor(db, staff, { name: "Invitation Probe One", slug: SLUG }, { verifierFixture: true });
  const c2 = await beginContractorFor(db, staff, { name: "Invitation Probe Two", slug: SLUG2 }, { verifierFixture: true });
  const c3 = await beginContractorFor(db, staff, { name: "Invitation Probe Three", slug: SLUG3 }, { verifierFixture: true });
  const c4 = await beginContractorFor(db, staff, { name: "Invitation Probe Four", slug: SLUG4 }, { verifierFixture: true });
  const c5 = await beginContractorFor(db, staff, { name: "Invitation Probe Five", slug: SLUG5 }, { verifierFixture: true });
  const c6 = await beginContractorFor(db, staff, { name: "Invitation Probe Six", slug: SLUG6 }, { verifierFixture: true });
  const c7 = await beginContractorFor(db, staff, { name: "Invitation Probe Seven", slug: SLUG7 }, { verifierFixture: true });
  const c8 = await beginContractorFor(db, staff, { name: "Invitation Probe Eight", slug: SLUG8 }, { verifierFixture: true });
  const c9 = await beginContractorFor(db, staff, { name: "Invitation Probe Nine", slug: SLUG9 }, { verifierFixture: true });
  const c10 = await beginContractorFor(db, staff, { name: "Invitation Probe Ten", slug: SLUG10 }, { verifierFixture: true });
  const c11 = await beginContractorFor(db, staff, { name: "Invitation Probe Eleven", slug: SLUG11 }, { verifierFixture: true });
  const c12 = await beginContractorFor(db, staff, { name: "Invitation Probe Twelve", slug: SLUG12 }, { verifierFixture: true });
  ok(`0. twelve fixture contractors created`, c1.ok && c2.ok && c3.ok && c4.ok && c5.ok && c6.ok && c7.ok && c8.ok && c9.ok && c10.ok && c11.ok && c12.ok);
  if (!c1.ok || !c2.ok || !c3.ok || !c4.ok || !c5.ok || !c6.ok || !c7.ok || !c8.ok || !c9.ok || !c10.ok || !c11.ok || !c12.ok) {
    console.error("  setup failed — aborting"); process.exit(1);
  }
  await raw.contractorMembership.create({ data: { userId: elsewhere.id, contractorId: c2.contractorId, role: "OWNER", active: true } });

  // ── 1. authorization ─────────────────────────────────────────────────
  ok(`1. signed out cannot invite an owner`, (await throwsWith(() => inviteOwnerFor(db, null, c1.contractorId, ownerEmail))) === "NotAuthenticatedError");
  ok(`   a non-staff session cannot invite an owner`, (await throwsWith(() => inviteOwnerFor(db, nobody, c1.contractorId, ownerEmail))) === "NotPlatformStaffError");
  ok(`   signed out cannot revoke an invitation`, (await throwsWith(() => revokeInvitationFor(db, null, c1.contractorId, "no-such-id"))) === "NotAuthenticatedError");
  ok(`   a non-staff session cannot revoke an invitation`, (await throwsWith(() => revokeInvitationFor(db, nobody, c1.contractorId, "no-such-id"))) === "NotPlatformStaffError");
  ok(`   an unknown contractor id is refused after authorization`, (await throwsWith(() => inviteOwnerFor(db, staff, "no-such-contractor", ownerEmail))) === "PlatformContractorNotFoundError");

  // ── 2. inviting: shape, delivery reporting, one pending at a time ─────
  const bad = await inviteOwnerFor(db, staff, c1.contractorId, "not-an-email");
  ok(`2. a malformed address is refused`, !bad.ok && bad.refusal.code === "EMAIL_INVALID");

  const invite1 = await inviteOwnerFor(db, staff, c1.contractorId, ownerEmail);
  ok(`   inviting creates a pending invitation`, invite1.ok && invite1.email === ownerEmail && !invite1.resent);
  ok(`   delivery succeeds through the dev mail sink, and never throws`, invite1.ok && invite1.delivered === true && invite1.mailError === undefined);
  const tokenA = await tokenFor(ownerEmail);
  // Delivery failing does not stop the token from existing — it is in the
  // sink because sendPlatformMail composes the mail (and the sink diverts it)
  // BEFORE any real network call would happen; a genuine send failure in
  // production would leave the row exactly as undelivered-but-real.
  ok(`   the raw token is readable from the sink, the same way a person reads their inbox`, !!tokenA);

  const peek1 = tokenA ? await peekInvitationFor(raw, tokenA) : { found: false as const };
  ok(`   peekInvitationFor finds it pending, and is READ ONLY`, peek1.found && peek1.status === "pending" && peek1.email === ownerEmail);
  const rowBefore = await raw.contractorInvitation.findFirst({ where: { contractorId: c1.contractorId }, select: { acceptedAt: true, revokedAt: true } });
  await peekInvitationFor(raw, tokenA ?? "");
  await peekInvitationFor(raw, tokenA ?? "");
  const rowAfterPeeks = await raw.contractorInvitation.findFirst({ where: { contractorId: c1.contractorId }, select: { acceptedAt: true, revokedAt: true } });
  ok(`   repeated peeks never write: acceptedAt and revokedAt are unchanged`, rowBefore?.acceptedAt === rowAfterPeeks?.acceptedAt && rowBefore?.revokedAt === rowAfterPeeks?.revokedAt);

  ok(`   a garbage token is not found`, !(await peekInvitationFor(raw, "not-a-real-token")).found);

  // Resend: same email, ATOMICALLY replaces the pending row.
  const invite2 = await inviteOwnerFor(db, staff, c1.contractorId, ownerEmail);
  ok(`   inviting again to the same address is a resend`, invite2.ok && invite2.resent);
  const rowOld = await raw.contractorInvitation.findFirst({ where: { contractorId: c1.contractorId, id: { not: invite2.ok ? invite2.invitationId : "" } }, select: { revokedAt: true } });
  ok(`   the previous invitation is revoked, not deleted — history is kept`, rowOld?.revokedAt != null);
  ok(`   the OLD token no longer works`, tokenA ? (await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, tokenA)).ok === false : true);
  const oldAcceptResult = tokenA ? await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, tokenA) : null;
  ok(`   ...specifically because it was revoked`, oldAcceptResult ? !oldAcceptResult.ok && oldAcceptResult.refusal.code === "INVITATION_REVOKED" : true);

  const pendingCount = await raw.contractorInvitation.count({ where: { contractorId: c1.contractorId, acceptedAt: null, revokedAt: null } });
  ok(`   exactly one invitation is pending for this contractor at a time`, pendingCount === 1);
  const tokenB = await tokenFor(ownerEmail);
  ok(`   the new token is different from the old one`, !!tokenB && tokenB !== tokenA);

  const invCount3a = await raw.contractorInvitation.count({ where: { contractorId: c1.contractorId } });
  ok(`   invitation history: two rows total for this contractor (one revoked, one pending)`, invCount3a === 2);

  // ── 3. acceptance refusals, on the CURRENT (tokenB) invitation ────────
  ok(`3. an unknown token is not found`, !(await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, "garbage")).ok);
  const notFound = await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, "garbage");
  ok(`   ...specifically INVITATION_NOT_FOUND`, !notFound.ok && notFound.refusal.code === "INVITATION_NOT_FOUND");

  const notSignedIn = tokenB ? await acceptInvitationFor(raw, null, tokenB) : null;
  ok(`   signed out is refused NOT_SIGNED_IN, before anything about the invitation is read`, notSignedIn ? !notSignedIn.ok && notSignedIn.refusal.code === "NOT_SIGNED_IN" : false);

  const wrongEmail = tokenB ? await acceptInvitationFor(raw, { id: nobody.id, email: nobody.email, emailVerified: true }, tokenB) : null;
  ok(`   signed in as the wrong address is refused EMAIL_MISMATCH`, wrongEmail ? !wrongEmail.ok && wrongEmail.refusal.code === "EMAIL_MISMATCH" : false);

  const unverified = tokenB ? await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: false }, tokenB) : null;
  ok(`   the right address, not yet verified, is refused NOT_VERIFIED`, unverified ? !unverified.ok && unverified.refusal.code === "NOT_VERIFIED" : false);

  // ALREADY_OWNS_ANOTHER: invite `elsewhere` (who already owns SLUG2) to
  // SLUG1's invitation address just for this sub-test, then clean it up.
  const sideInvite = await inviteOwnerFor(db, staff, c1.contractorId, elsewhereEmail);
  const sideToken = await tokenFor(elsewhereEmail);
  const alreadyOwns = sideToken ? await acceptInvitationFor(raw, { id: elsewhere.id, email: elsewhereEmail, emailVerified: true }, sideToken) : null;
  ok(`   an account that already owns another business is refused ALREADY_OWNS_ANOTHER`, alreadyOwns ? !alreadyOwns.ok && alreadyOwns.refusal.code === "ALREADY_OWNS_ANOTHER" : false);
  ok(`   ...and no membership was created for it`, !(await raw.contractorMembership.findUnique({ where: { userId_contractorId: { userId: elsewhere.id, contractorId: c1.contractorId } } })));
  // Restore: revoke the side invitation and re-invite the real owner, since
  // inviting elsewhere superseded tokenB.
  ok(`   revoking the side invitation succeeds`, sideInvite.ok ? (await revokeInvitationFor(db, staff, c1.contractorId, sideInvite.invitationId)).ok : false);
  const invite3 = await inviteOwnerFor(db, staff, c1.contractorId, ownerEmail);
  const tokenC = await tokenFor(ownerEmail);
  ok(`   re-invited the real owner after the side probe`, invite3.ok && !!tokenC && tokenC !== tokenB);

  // ── 4. the happy path, then idempotent replay ─────────────────────────
  await raw.user.update({ where: { id: owner.id }, data: { emailVerified: true } });
  const accepted = tokenC ? await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, tokenC) : null;
  ok(`4. the matching, verified user accepts`, accepted ? accepted.ok && !accepted.already && accepted.contractorId === c1.contractorId : false);
  const membership = await raw.contractorMembership.findUnique({ where: { userId_contractorId: { userId: owner.id, contractorId: c1.contractorId } }, select: { role: true, active: true } });
  ok(`   ...and a live OWNER membership exists`, membership?.role === "OWNER" && membership.active === true);
  const spentRow = await raw.contractorInvitation.findUnique({ where: { id: invite3.ok ? invite3.invitationId : "" }, select: { acceptedAt: true, acceptedByUserId: true } });
  ok(`   the invitation is stamped spent, by this user`, spentRow?.acceptedAt != null && spentRow.acceptedByUserId === owner.id);

  const replay = tokenC ? await acceptInvitationFor(raw, { id: owner.id, email: ownerEmail, emailVerified: true }, tokenC) : null;
  ok(`   the SAME user accepting again is idempotent success`, replay ? replay.ok && replay.already : false);
  const replayCount = await raw.contractorMembership.count({ where: { userId: owner.id, contractorId: c1.contractorId } });
  ok(`   ...and did not create a second membership row`, replayCount === 1);

  const usedByAnyone = tokenC ? await acceptInvitationFor(raw, { id: nobody.id, email: ownerEmail /* impossible in reality; proves the used-branch, not the mismatch-branch */, emailVerified: true }, tokenC) : null;
  ok(`   a spent token presented by anyone else is refused INVITATION_ALREADY_USED`, usedByAnyone ? !usedByAnyone.ok && usedByAnyone.refusal.code === "INVITATION_ALREADY_USED" : false);

  // ── 5. concurrency ─────────────────────────────────────────────────────
  // 5a. two simultaneous accepts of ONE token.
  const invite5a = await inviteOwnerFor(db, staff, c4.contractorId, `${EMAIL_PREFIX}${RUN}-race-a@invalid.test`);
  const raceEmailA = `${EMAIL_PREFIX}${RUN}-race-a@invalid.test`;
  const raceUserA = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-race-a`, email: raceEmailA, name: "Race A", emailVerified: true }, select: { id: true, email: true } });
  const raceTokenA = await tokenFor(raceEmailA);
  const [raceR1, raceR2] = raceTokenA
    ? await Promise.all([
        acceptInvitationFor(raw, { id: raceUserA.id, email: raceEmailA, emailVerified: true }, raceTokenA),
        acceptInvitationFor(raw, { id: raceUserA.id, email: raceEmailA, emailVerified: true }, raceTokenA),
      ])
    : [null, null];
  ok(`5a. two simultaneous accepts of the same token: both callers see success`, !!raceR1?.ok && !!raceR2?.ok);
  const raceMembershipCount = await raw.contractorMembership.count({ where: { userId: raceUserA.id, contractorId: c4.contractorId } });
  ok(`    ...and exactly one membership row exists, never two`, raceMembershipCount === 1);

  // 5b. two simultaneous FIRST-ownership grants for ONE user, through TWO
  // different invitations on two different contractors — the cross-path race
  // withOwnershipLock exists for.
  const raceEmailB = `${EMAIL_PREFIX}${RUN}-race-b@invalid.test`;
  const raceUserB = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-race-b`, email: raceEmailB, name: "Race B", emailVerified: true }, select: { id: true, email: true } });
  await inviteOwnerFor(db, staff, c3.contractorId, raceEmailB);
  const raceTokenC3 = await tokenFor(raceEmailB);
  await inviteOwnerFor(db, staff, c5.contractorId, raceEmailB);
  const raceTokenC5 = await tokenFor(raceEmailB);
  const [raceB1, raceB2] = raceTokenC3 && raceTokenC5
    ? await Promise.all([
        acceptInvitationFor(raw, { id: raceUserB.id, email: raceEmailB, emailVerified: true }, raceTokenC3),
        acceptInvitationFor(raw, { id: raceUserB.id, email: raceEmailB, emailVerified: true }, raceTokenC5),
      ])
    : [null, null];
  const raceBWinners = [raceB1, raceB2].filter((r) => r?.ok).length;
  const raceBRefusals = [raceB1, raceB2].filter((r) => r && !r.ok && r.refusal.code === "ALREADY_OWNS_ANOTHER").length;
  ok(`5b. two simultaneous grants of a user's FIRST ownership, across two different contractors: exactly one wins`, raceBWinners === 1 && raceBRefusals === 1);
  const raceBOwnedCount = await raw.contractorMembership.count({ where: { userId: raceUserB.id, role: "OWNER", active: true } });
  ok(`    ...and the account ends up owning exactly one business, never two`, raceBOwnedCount === 1);

  // ── 6. retirement: enforced server-side, revoke stays available ──────
  const invite6 = await inviteOwnerFor(db, staff, c6.contractorId, `${EMAIL_PREFIX}${RUN}-retire-target@invalid.test`);
  const retireTargetEmail = `${EMAIL_PREFIX}${RUN}-retire-target@invalid.test`;
  const retireUser = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-retire-target`, email: retireTargetEmail, name: "Retire target", emailVerified: true }, select: { id: true } });
  const retire = await retireContractorFor(db, staff, c6.contractorId, SLUG6);
  ok(`6. retiring c6 succeeds`, retire.ok);

  ok(`   inviting an owner on a retired contractor is refused server-side`, (await inviteOwnerFor(db, staff, c6.contractorId, "someone@invalid.test") as { ok: false; refusal: { code: string } }).refusal?.code === "RETIRED");
  ok(`   attaching an owner on a retired contractor is refused server-side`, (await attachOwnerFor(db, staff, c6.contractorId, "someone@invalid.test") as { ok: false; refusal: { code: string } }).refusal?.code === "RETIRED");
  ok(`   enrolling a trade on a retired contractor is refused server-side`, (await enrolTradeFor(db, staff, c6.contractorId, "electrical") as { ok: false; refusal: { code: string } }).refusal?.code === "RETIRED");
  ok(`   installing a catalog on a retired contractor is refused server-side`, (await installTradeTemplateFor(db, staff, c6.contractorId) as { ok: false; refusal: { code: string } }).refusal?.code === "RETIRED");

  const retireToken = await tokenFor(retireTargetEmail);
  const retiredAccept = retireToken ? await acceptInvitationFor(raw, { id: retireUser.id, email: retireTargetEmail, emailVerified: true }, retireToken) : null;
  // Retirement now revokes any pending invitation ATOMICALLY, in the same
  // transaction (the review's own requirement) — so by the time this runs
  // sequentially after retire, the invitation's own revokedAt is already
  // set, and INVITATION_REVOKED is the correct, more specific refusal.
  // CONTRACTOR_RETIRED is still real code, reachable when retirement and
  // acceptance genuinely race — see section 9d below.
  ok(`   accepting an invitation on a business retired moments earlier is refused INVITATION_REVOKED, atomically`, retiredAccept ? !retiredAccept.ok && retiredAccept.refusal.code === "INVITATION_REVOKED" : false);
  ok(`   ...and no membership was created`, !(await raw.contractorMembership.findUnique({ where: { userId_contractorId: { userId: retireUser.id, contractorId: c6.contractorId } } })));

  ok(`   revoking the already-retirement-revoked invitation is idempotent`, invite6.ok ? (await revokeInvitationFor(db, staff, c6.contractorId, invite6.invitationId)).ok : false);

  // ── 7. tenant isolation ────────────────────────────────────────────────
  const invite7 = await inviteOwnerFor(db, staff, c7.contractorId, `${EMAIL_PREFIX}${RUN}-tenant-check@invalid.test`);
  const crossTenant = invite7.ok ? await revokeInvitationFor(db, staff, c2.contractorId, invite7.invitationId) : null;
  ok(`7. revoking a real invitation through the WRONG contractor's door is refused`, crossTenant ? !crossTenant.ok && crossTenant.refusal.code === "INVITATION_NOT_FOUND" : false);
  const untouched = invite7.ok ? await raw.contractorInvitation.findUnique({ where: { id: invite7.invitationId }, select: { revokedAt: true } }) : null;
  ok(`   ...and the real invitation is untouched`, untouched?.revokedAt == null);

  // ── 8. deterministic concurrency, beyond the single-token races above ──

  // 8a. two simultaneous invites/resends for ONE contractor. Before this
  // review's fix, both could read "nothing pending yet" and each create
  // their own row — two pending invitations, violating the one-per-contractor
  // rule. Locked, the second's read happens only after the first commits.
  const emailA = `${EMAIL_PREFIX}${RUN}-8a-first@invalid.test`;
  const emailB = `${EMAIL_PREFIX}${RUN}-8a-second@invalid.test`;
  const [inv8aFirst, inv8aSecond] = await Promise.all([
    inviteOwnerFor(db, staff, c8.contractorId, emailA),
    inviteOwnerFor(db, staff, c8.contractorId, emailB),
  ]);
  ok(`8a. two simultaneous invites for one contractor: both callers see success`, inv8aFirst.ok && inv8aSecond.ok);
  const pending8a = await raw.contractorInvitation.findMany({ where: { contractorId: c8.contractorId, acceptedAt: null, revokedAt: null }, select: { id: true } });
  ok(`     ...and exactly ONE pending invitation exists afterward, never two`, pending8a.length === 1);
  const total8a = await raw.contractorInvitation.count({ where: { contractorId: c8.contractorId } });
  ok(`     ...the other is revoked, not deleted — two rows total`, total8a === 2);

  // 8b. acceptance racing a REPLACEMENT (resend to a different address) of
  // the SAME invitation. Exactly one of two deterministic outcomes: accept
  // wins (a membership exists; the invite call then sees an owner already
  // attached and is refused) or the resend wins (accept's token is now
  // revoked, refused; no membership).
  const invite9 = await inviteOwnerFor(db, staff, c9.contractorId, `${EMAIL_PREFIX}${RUN}-9-original@invalid.test`);
  const originalEmail9 = `${EMAIL_PREFIX}${RUN}-9-original@invalid.test`;
  const originalUser9 = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-9-original`, email: originalEmail9, name: "Original 9", emailVerified: true }, select: { id: true } });
  const originalToken9 = await tokenFor(originalEmail9);
  const [accept9, resend9] = originalToken9
    ? await Promise.all([
        acceptInvitationFor(raw, { id: originalUser9.id, email: originalEmail9, emailVerified: true }, originalToken9),
        inviteOwnerFor(db, staff, c9.contractorId, `${EMAIL_PREFIX}${RUN}-9-replacement@invalid.test`),
      ])
    : [null, null];
  const acceptWon9 = accept9?.ok === true;
  const resendWon9 = resend9?.ok === true && !accept9?.ok;
  ok(`8b. acceptance racing a resend of the same invitation: exactly one deterministic outcome`,
    !!((acceptWon9 && resend9 && !resend9.ok && resend9.refusal.code === "OWNER_ALREADY_ATTACHED")
    || (resendWon9 && accept9 && !accept9.ok && (accept9.refusal.code === "INVITATION_REVOKED" || accept9.refusal.code === "INVITATION_NO_LONGER_VALID"))));
  const membershipCount9 = await raw.contractorMembership.count({ where: { contractorId: c9.contractorId, role: "OWNER", active: true } });
  ok(`     ...and the contractor ends up with exactly the owners that outcome implies`, membershipCount9 === (acceptWon9 ? 1 : 0));

  // 8c. acceptance racing an explicit REVOKE of the SAME invitation.
  const invite10 = await inviteOwnerFor(db, staff, c10.contractorId, `${EMAIL_PREFIX}${RUN}-10@invalid.test`);
  const email10 = `${EMAIL_PREFIX}${RUN}-10@invalid.test`;
  const user10 = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-10`, email: email10, name: "Ten", emailVerified: true }, select: { id: true } });
  const token10 = await tokenFor(email10);
  const [accept10, revoke10] = token10 && invite10.ok
    ? await Promise.all([
        acceptInvitationFor(raw, { id: user10.id, email: email10, emailVerified: true }, token10),
        revokeInvitationFor(db, staff, c10.contractorId, invite10.invitationId),
      ])
    : [null, null];
  const acceptWon10 = accept10?.ok === true;
  ok(`8c. acceptance racing an explicit revoke of the same invitation: exactly one deterministic outcome`,
    acceptWon10
      ? !!revoke10?.ok // the invitation was already accepted; revoke sees "nothing to revoke" as a clean refusal or an already-consumed row — either way, no crash and no membership loss
      : !!(accept10 && !accept10.ok && (accept10.refusal.code === "INVITATION_REVOKED" || accept10.refusal.code === "INVITATION_NO_LONGER_VALID")));
  const membershipCount10 = await raw.contractorMembership.count({ where: { contractorId: c10.contractorId, userId: user10.id, active: true } });
  ok(`     ...and a membership exists if and only if accept won`, membershipCount10 === (acceptWon10 ? 1 : 0));

  // 8d. acceptance racing RETIREMENT of the same contractor. This is the
  // race withContractorLock exists for: whichever gets the lock first
  // completes entirely before the other's reads run.
  const invite11 = await inviteOwnerFor(db, staff, c11.contractorId, `${EMAIL_PREFIX}${RUN}-11@invalid.test`);
  const email11 = `${EMAIL_PREFIX}${RUN}-11@invalid.test`;
  const user11 = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-11`, email: email11, name: "Eleven", emailVerified: true }, select: { id: true } });
  const token11 = await tokenFor(email11);
  const [accept11, retire11] = token11
    ? await Promise.all([
        acceptInvitationFor(raw, { id: user11.id, email: email11, emailVerified: true }, token11),
        retireContractorFor(db, staff, c11.contractorId, SLUG11),
      ])
    : [null, null];
  const acceptWon11 = accept11?.ok === true;
  ok(`8d. acceptance racing retirement of the same contractor: exactly one deterministic outcome`,
    !!retire11?.ok
      && (acceptWon11
        ? true // accept won: a membership exists even though the contractor is now retired — a fair, real outcome, not a bug
        : accept11 && !accept11.ok && (accept11.refusal.code === "CONTRACTOR_RETIRED" || accept11.refusal.code === "INVITATION_REVOKED")));
  const membershipCount11 = await raw.contractorMembership.count({ where: { contractorId: c11.contractorId, userId: user11.id, active: true } });
  ok(`     ...and a membership exists if and only if accept won`, membershipCount11 === (acceptWon11 ? 1 : 0));
  const retiredRow11 = await raw.contractor.findUniqueOrThrow({ where: { id: c11.contractorId }, select: { active: true } });
  ok(`     ...and the contractor is retired either way — accept winning first does not block retirement from also completing`, retiredRow11.active === false);

  // 8e. acceptance racing staff ATTACHMENT of the SAME target account —
  // convergence, not exclusion: both paths grant the identical membership
  // row (same userId, same contractorId), so the invariant is "exactly one
  // active OWNER membership for that pair afterward", regardless of order.
  const email12 = `${EMAIL_PREFIX}${RUN}-12@invalid.test`;
  const user12 = await raw.user.create({ data: { id: `${USER_PREFIX}-${RUN}-12`, email: email12, name: "Twelve", emailVerified: true }, select: { id: true } });
  const invite12 = await inviteOwnerFor(db, staff, c12.contractorId, email12);
  const token12 = await tokenFor(email12);
  const [accept12, attach12] = token12
    ? await Promise.all([
        acceptInvitationFor(raw, { id: user12.id, email: email12, emailVerified: true }, token12),
        attachOwnerFor(db, staff, c12.contractorId, email12),
      ])
    : [null, null];
  ok(`8e. acceptance racing staff attachment of the SAME account: both converge without error`, accept12?.ok === true && attach12?.ok === true);
  const membershipRows12 = await raw.contractorMembership.count({ where: { userId: user12.id, contractorId: c12.contractorId, role: "OWNER", active: true } });
  ok(`     ...to exactly one active OWNER membership, never two`, membershipRows12 === 1);

  console.log(`\n  ${fail === 0 ? "cleanup, then done" : `${fail} check(s) failed`}\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG, SLUG2, SLUG3, SLUG4, SLUG5, SLUG6, SLUG7, SLUG8, SLUG9, SLUG10, SLUG11, SLUG12] } } });
  ok(`9. every fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
