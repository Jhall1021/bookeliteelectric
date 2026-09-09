/**
 * Sign-up -> email verification -> invitation acceptance, through the real
 * auth stack rather than a hand-built user object.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl npx tsx scripts/verify-invitation-live-flow.ts
 *   (needs a dev server running with the SAME PLATFORM_MAIL_SINK set)
 *
 * WHY THIS EXISTS ALONGSIDE verify-contractor-invitations.ts
 *
 * That verifier calls `acceptInvitationFor` with a HAND-CONSTRUCTED
 * `{ id, email, emailVerified }` object — it proves the authority's own logic
 * exhaustively, but nothing about it ever touches better-auth's real sign-up,
 * password hashing, or verification-token flow. This script does: a fresh
 * account is created through the real `/api/auth/sign-up/email` endpoint,
 * verified by opening the REAL link better-auth emailed it (read from the
 * dev mail sink, the same technique scripts/verify-account-bootstrap.ts
 * already uses — opening an inbox is the one step a script cannot perform),
 * and the RESULTING real user row — not a fixture I invented — is what gets
 * handed to acceptInvitationFor.
 *
 * WHAT IS NOT REPLICATED OVER HTTP, AND WHY
 *
 * Acceptance itself is still a direct call, not a POST to the page's server
 * action. Next.js server actions are invoked over a private wire protocol
 * (a `Next-Action` header carrying a per-build hash) that no other verifier
 * in this codebase attempts to reproduce — every one of them calls the
 * library function directly, which is exactly what proves the AUTHORITY is
 * correct. What this script adds on top is that the ACCOUNT reaching that
 * call is now a real one, produced by the real pipeline, not asserted.
 *
 * NOT PART OF `npm run verify`. Needs a running server, like
 * verify-account-bootstrap.ts and verify-platform-bootstrap-live.ts — run it
 * separately.
 */

import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { destroyContractor } from "./_throwaway";
import { inviteOwnerFor, beginContractorFor } from "../lib/platformOnboarding";
import { acceptInvitationFor } from "../lib/contractorInvitations";

const prisma = new PrismaClient();
const BASE = process.env.LIVE_FLOW_BASE_URL ?? "http://localhost:3000";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-mail.jsonl";

const stamp = process.env.LIVE_FLOW_STAMP ?? String(process.hrtime.bigint()).slice(-9);
const EMAIL = `p2b-live-flow-${stamp}@resend.dev`;
const PASSWORD = "correct-horse-battery-staple-9";
const SLUG = `test-invitation-live-flow-${stamp}`;
const RUN = stamp;
const USER_PREFIX = "test-invitation-live-flow";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const jar: string[] = [];
async function call(path: string, init?: { method?: string; body?: unknown; headers?: Record<string, string>; jar?: string[] }) {
  const cookies = init?.jar ?? jar;
  const res = await fetch(BASE + path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: { "content-type": "application/json", origin: BASE, cookie: cookies.join("; "), ...(init?.headers ?? {}) },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    const name = kv.split("=")[0];
    const i = cookies.findIndex((e) => e.startsWith(`${name}=`));
    if (i >= 0) cookies[i] = kv; else cookies.push(kv);
  }
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* html or redirect */ }
  return { status: res.status, body, text, location: res.headers.get("location") };
}

/** Reads the dev sink the same way a person reads their inbox: the most recent message addressed to this email, matching the given subject. */
async function linkFor(email: string, subjectMatch: RegExp): Promise<string | null> {
  let raw = "";
  try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw.split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { to: string; subject: string; text: string }; } catch { return null; } })
    .filter((m): m is { to: string; subject: string; text: string } => m !== null && m.to === email && subjectMatch.test(m.subject));
  const last = mine.at(-1);
  return last?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

/** The invitation link's own subject is "You're invited to join <business> on Price2Book" — matched loosely, since the business name is generated per run. */
const verificationLinkFor = (email: string) => linkFor(email, /confirm/i);
const invitationLinkFor = (email: string) => linkFor(email, /invited to join/i);

async function teardown() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
  await prisma.contractorInvitation.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await prisma.contractorMembership.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await prisma.contractorOnboarding.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
  await destroyContractor(prisma, SLUG).catch(() => {});
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL } } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

async function main() {
  console.log(`\nINVITATION LIVE FLOW — sign-up, verification and acceptance through the real auth stack\n`);
  console.log(`  ${BASE}  ·  ${EMAIL}  ·  sink ${SINK}\n`);
  await teardown();

  // ── 0. the pending invitation, minted the ordinary staff way ───────────
  const staff = { id: `${USER_PREFIX}-${RUN}-staff`, email: `p2b-live-flow-staff-${RUN}@invalid.test` };
  // A recording double, same technique as scripts/verify-platform-onboarding.ts:
  // this is the ONE place in this script that is not "the real thing" —
  // proving PlatformAccess itself is a different verifier's job entirely.
  const raw = prisma as unknown as PrismaClient;
  const db = new Proxy(raw, {
    get(t, p) {
      if (p === "platformAccess") {
        return { findUnique: async () => ({ role: "PLATFORM_ADMIN", grantedAt: new Date(), revokedAt: null }) };
      }
      return Reflect.get(t, p);
    },
  }) as unknown as PrismaClient;

  const contractor = await beginContractorFor(db, staff, { name: "Live Flow Electric", slug: SLUG }, { verifierFixture: true });
  ok(`0. the fixture contractor exists`, contractor.ok);
  if (!contractor.ok) { console.error("  setup failed — aborting"); await teardown(); process.exit(1); }

  const invite = await inviteOwnerFor(db, staff, contractor.contractorId, EMAIL, { ownerName: "Live Flow Owner" });
  ok(`   inviting the not-yet-existing owner succeeds`, invite.ok);
  if (!invite.ok) { console.error("  invite failed — aborting"); await teardown(); process.exit(1); }
  ok(`   the invitation email is delivered (through the dev sink)`, invite.delivered, invite.mailError ?? "");

  const invitationLink = await invitationLinkFor(EMAIL);
  ok(`   the invitation link is readable from the sink, the same way a person reads their inbox`, invitationLink !== null, `nothing addressed to ${EMAIL} in ${SINK}`);
  if (!invitationLink) { console.error("  no invitation link — aborting"); await teardown(); process.exit(1); }
  const rawToken = invitationLink.split("/invite/")[1]?.split(/[?#]/)[0];
  ok(`   a token can be pulled from the link's own path`, !!rawToken);

  // ── 1. sign up, for real, at the invited address ───────────────────────
  const signUp = await call("/api/auth/sign-up/email", {
    body: { name: "Live Flow Owner", email: EMAIL, password: PASSWORD, callbackURL: "/start" },
  });
  ok(`1. the invited address can create an account`, signUp.status === 200, `${signUp.status} ${signUp.text.slice(0, 120)}`);

  const created = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true, emailVerified: true } });
  ok(`   the account exists and is NOT yet verified`, created !== null && created.emailVerified === false);

  // ── 2. unverified: acceptInvitationFor itself refuses it ───────────────
  const tooEarly = rawToken ? await acceptInvitationFor(prisma, { id: created!.id, email: EMAIL, emailVerified: false }, rawToken) : null;
  ok(`2. accepting before verification is refused NOT_VERIFIED`, tooEarly ? !tooEarly.ok && tooEarly.refusal.code === "NOT_VERIFIED" : false);

  // ── 3. verify, by opening the REAL link better-auth sent ───────────────
  const link = await verificationLinkFor(EMAIL);
  ok(`3. a confirmation email was sent with a link`, link !== null, `nothing addressed to ${EMAIL} in ${SINK}`);
  if (!link) { console.error("  no verification link — aborting"); await teardown(); process.exit(1); }

  const verified = await call(link.replace(BASE, ""));
  ok(`   opening it verifies the address`, verified.status === 200 || verified.status === 302, String(verified.status));

  const afterVerify = await prisma.user.findFirstOrThrow({ where: { email: EMAIL }, select: { id: true, email: true, emailVerified: true } });
  ok(`   and the account is now verified, for real — not asserted`, afterVerify.emailVerified === true);

  // ── 4. accept, as the account the real pipeline just produced ──────────
  const accepted = rawToken ? await acceptInvitationFor(prisma, afterVerify, rawToken) : null;
  ok(`4. the real, now-verified account accepts the invitation`, accepted ? accepted.ok && !accepted.already : false,
    accepted && !accepted.ok ? `${accepted.refusal.code}: ${accepted.refusal.message}` : "");

  const membership = await prisma.contractorMembership.findFirst({
    where: { userId: afterVerify.id, contractorId: contractor.contractorId }, select: { role: true, active: true },
  });
  ok(`   a live OWNER membership exists`, membership?.role === "OWNER" && membership.active === true);

  // ── 5. idempotent replay, same real account ─────────────────────────────
  const replay = rawToken ? await acceptInvitationFor(prisma, afterVerify, rawToken) : null;
  ok(`5. accepting again with the same real, signed-in account is idempotent`, replay ? replay.ok && replay.already : false);

  console.log(`\n  ${fail === 0 ? "cleanup, then done" : `${fail} check(s) failed`}\n`);
  await teardown();
  const residue = await prisma.contractor.count({ where: { slug: SLUG } });
  ok(`6. every fixture is gone at the end`, residue === 0);
  await prisma.$disconnect();
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
