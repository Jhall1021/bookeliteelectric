/**
 * Invitation → signup → verification → acceptance, driven through a REAL
 * BROWSER against the REAL pages, so the server action itself gets exercised
 * — not reconstructed.
 *
 *   PLATFORM_MAIL_SINK=/tmp/some-file.jsonl BETTER_AUTH_URL=http://localhost:3417 \
 *     npx tsx scripts/verify-invitation-browser-flow.ts
 *   (needs a dev server running on the SAME port, with the SAME
 *   PLATFORM_MAIL_SINK and BETTER_AUTH_URL set)
 *
 * WHY THIS EXISTS ALONGSIDE verify-invitation-live-flow.ts
 *
 * That script proves the real auth pipeline (sign-up, hashing, verification)
 * feeds a real user row into `acceptInvitationFor` — but it still calls
 * `acceptInvitationFor` directly. It says so itself: Next.js server actions
 * are invoked over a private wire protocol (a `Next-Action` header carrying a
 * per-build hash) that this codebase has never tried to reproduce by hand,
 * and reproducing it would test a guess about that protocol, not the app.
 *
 * A real browser sidesteps the question entirely: Playwright drives an
 * actual `<form action={acceptInvitationAction}>` submit exactly the way a
 * person's click does, whatever the wire format turns out to be. This is
 * what "don't reconstruct the private protocol — drive a browser instead"
 * means in practice.
 *
 * What this script does NOT re-prove: `verify-contractor-invitations.ts`
 * covers every refusal, race and idempotency rule against the real database
 * with hand-built identities — cheap, exhaustive, and rerun on every chain.
 * This script proves the four real systems the wizard depends on
 * (Next.js routing, better-auth, the dev mail sink, the server action) fit
 * together for exactly the two journeys a person actually takes:
 *
 *   1. brand-new account: invite → sign up → confirm email → land back on
 *      the SAME invitation → accept → the tenant-bound welcome page
 *   2. existing, already-verified account: invite → sign in → land back on
 *      the SAME invitation → accept → the tenant-bound welcome page
 *
 * NOT PART OF `npm run verify`. Needs a running server on a fixed port, like
 * verify-invitation-live-flow.ts and verify-account-bootstrap.ts — run it
 * separately.
 */

import { chromium } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { destroyContractor } from "./_throwaway";
import { beginContractorFor, inviteOwnerFor } from "../lib/platformOnboarding";

const prisma = new PrismaClient();
const BASE = process.env.BROWSER_FLOW_BASE_URL ?? "http://localhost:3417";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-mail.jsonl";
const PASSWORD = "correct-horse-battery-staple-9";

const RUN = process.env.BROWSER_FLOW_STAMP ?? `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-invitation-browser-flow";
const SLUG_NEW = `${SLUG_PREFIX}-${RUN}-new`; // journey 1: brand-new account
const SLUG_EXISTING = `${SLUG_PREFIX}-${RUN}-existing`; // journey 2: existing account, sign-in
const USER_PREFIX = "test-invitation-browser-flow";
const NEW_EMAIL = `p2b-browser-flow-new-${RUN}@resend.dev`;
const EXISTING_EMAIL = `p2b-browser-flow-existing-${RUN}@resend.dev`;

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

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
const verificationLinkFor = (email: string) => linkFor(email, /confirm/i);
const invitationLinkFor = (email: string) => linkFor(email, /invited to join/i);

async function removeContractor(slug: string) {
  await prisma.contractorInvitation.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await prisma.contractorMembership.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await prisma.contractorOnboarding.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await prisma.contractorSite.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(prisma, slug).catch(() => {});
}

async function removeUser(email: string) {
  const user = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (!user) return;
  await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
  await prisma.verification.deleteMany({ where: { identifier: { contains: email } } }).catch(() => {});
  await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
}

/** Everything this run could have left behind, gone — called before starting AND in the finally block, so a failed prior run never poisons this one and this run never poisons the next. */
async function teardown() {
  await removeContractor(SLUG_NEW);
  await removeContractor(SLUG_EXISTING);
  await removeUser(NEW_EMAIL);
  await removeUser(EXISTING_EMAIL);
}

/** Mints an invitation the ordinary staff way — the one place in this script that is not "the real thing"; proving PlatformAccess itself is a different verifier's job. */
async function inviteOwner(contractorId: string, email: string, ownerName: string) {
  const staff = { id: `${USER_PREFIX}-${RUN}-staff`, email: `p2b-browser-flow-staff-${RUN}@invalid.test` };
  const db = new Proxy(prisma, {
    get(t, p) {
      if (p === "platformAccess") return { findUnique: async () => ({ role: "PLATFORM_ADMIN", grantedAt: new Date(), revokedAt: null }) };
      return Reflect.get(t, p);
    },
  }) as unknown as PrismaClient;
  const contractor = await beginContractorFor(db, staff, { name: `${email === NEW_EMAIL ? "Browser Flow New" : "Browser Flow Existing"} Electric`, slug: contractorId }, { verifierFixture: true });
  if (!contractor.ok) throw new Error(`fixture contractor setup failed for ${contractorId}`);
  const invite = await inviteOwnerFor(db, staff, contractor.contractorId, email, { ownerName });
  if (!invite.ok) throw new Error(`invite failed: ${invite.refusal.code}`);
  return { contractorId: contractor.contractorId };
}

async function main() {
  console.log(`\nINVITATION BROWSER FLOW — signup and sign-in, driven through the real pages and the real server action\n`);
  console.log(`  ${BASE}  ·  sink ${SINK}\n`);

  const browser = await chromium.launch();
  try {
    await teardown();

    // ══════════════════════════════════════════════════════════════════
    // Journey 1 — a brand-new account: invite → sign up → confirm email
    // → land back on the SAME invitation → accept → welcome
    // ══════════════════════════════════════════════════════════════════
    const c1 = await inviteOwner(SLUG_NEW, NEW_EMAIL, "Browser Flow Owner");
    const invitationLink1 = await invitationLinkFor(NEW_EMAIL);
    ok(`1. the invitation link is readable from the sink`, invitationLink1 !== null, `nothing addressed to ${NEW_EMAIL} in ${SINK}`);
    if (!invitationLink1) throw new Error("no invitation link for the new-account journey — aborting");

    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();

    await page1.goto(invitationLink1);
    ok(`   the invite page names the business and offers to create an account`, (await page1.textContent("h1"))?.includes("Join") ?? false);
    const createAccountLink = page1.getByRole("link", { name: "Create an account" });
    ok(`   a "Create an account" link is offered while signed out`, await createAccountLink.isVisible());
    await createAccountLink.click();
    await page1.waitForURL(/\/sign-up\?/);

    ok(`2. sign-up prefills the invited email`, (await page1.locator("#email").inputValue()) === NEW_EMAIL);
    ok(`   ...and the owner name the staff member typed`, (await page1.locator("#name").inputValue()) === "Browser Flow Owner");
    await page1.locator("#password").fill(PASSWORD);
    await page1.getByRole("button", { name: "Create account" }).click();
    await page1.waitForSelector("h1:has-text('Confirm your email')");
    ok(`   signing up leaves the browser on "Confirm your email"`, true);

    const created = await prisma.user.findFirst({ where: { email: NEW_EMAIL }, select: { id: true, emailVerified: true } });
    ok(`   the account exists, not yet verified`, created !== null && created.emailVerified === false);

    const verifyLink1 = await verificationLinkFor(NEW_EMAIL);
    ok(`3. a confirmation email was sent with a link`, verifyLink1 !== null, `nothing addressed to ${NEW_EMAIL} in ${SINK}`);
    if (!verifyLink1) throw new Error("no verification link for the new-account journey — aborting");

    // Same browser context (same cookies) opens the REAL link better-auth
    // sent — this is the one step a script cannot perform for a real person,
    // and the one the earlier direct-call verifier explicitly does not cover.
    await page1.goto(verifyLink1);
    await page1.waitForURL(new RegExp(`/invite/`), { timeout: 10_000 });
    ok(`   opening it verifies the address AND returns the browser to the SAME invitation, unprompted`, page1.url().includes("/invite/"));

    const acceptButton1 = page1.getByRole("button", { name: /Accept and join/ });
    ok(`4. the invite page now offers to accept, signed in as the matching verified address`, await acceptButton1.isVisible());
    await acceptButton1.click();
    await page1.waitForURL(/\/dashboard\/welcome/, { timeout: 10_000 });
    ok(`   accepting — the REAL <form action={acceptInvitationAction}> submit — lands on the welcome page`, page1.url().includes("/dashboard/welcome"));
    ok(`   ...naming the invited business, not a generic screen`, (await page1.textContent("body"))?.includes("Browser Flow New Electric") ?? false);

    const membership1 = await prisma.contractorMembership.findFirst({ where: { contractorId: c1.contractorId }, select: { role: true, active: true, user: { select: { email: true } } } });
    ok(`   a live OWNER membership exists for the real account`, membership1?.role === "OWNER" && membership1.active === true && membership1.user.email === NEW_EMAIL);

    await ctx1.close();

    // ══════════════════════════════════════════════════════════════════
    // Journey 2 — an existing, already-verified account: invite → sign in
    // → land back on the SAME invitation → accept → welcome
    // ══════════════════════════════════════════════════════════════════
    // The account has to be real and really verified — built the same way
    // journey 1's was, through the real sign-up + verification pages, on its
    // own contractor-free context, THEN signed out before the invitation
    // exists, so "existing account" here means what it says: a person who
    // already had a Price2Book login before anyone invited them.
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(`${BASE}/sign-up`);
    await page2.locator("#name").fill("Existing Owner");
    await page2.locator("#email").fill(EXISTING_EMAIL);
    await page2.locator("#password").fill(PASSWORD);
    await page2.getByRole("button", { name: "Create account" }).click();
    await page2.waitForSelector("h1:has-text('Confirm your email')");
    const verifyLink2 = await verificationLinkFor(EXISTING_EMAIL);
    ok(`5. the pre-existing account's own confirmation link is readable`, verifyLink2 !== null);
    if (!verifyLink2) throw new Error("no verification link for the pre-existing account — aborting");
    await page2.goto(verifyLink2);
    const verified2 = await prisma.user.findFirst({ where: { email: EXISTING_EMAIL }, select: { emailVerified: true } });
    ok(`   it is now a real, verified account — before any invitation exists`, verified2?.emailVerified === true);
    // Sign out: this journey starts SIGNED OUT, the same as any invited
    // person who already had an account but isn't currently logged in.
    await page2.context().clearCookies();

    const c2 = await inviteOwner(SLUG_EXISTING, EXISTING_EMAIL, "Existing Owner");
    const invitationLink2 = await invitationLinkFor(EXISTING_EMAIL);
    ok(`6. the second invitation link is readable`, invitationLink2 !== null);
    if (!invitationLink2) throw new Error("no invitation link for the existing-account journey — aborting");

    await page2.goto(invitationLink2);
    const signInLink = page2.getByRole("link", { name: "I already have an account" });
    ok(`   signed out, the invite page also offers "I already have an account"`, await signInLink.isVisible());
    await signInLink.click();
    await page2.waitForURL(/\/sign-in\?/);
    ok(`   sign-in prefills the invited email`, (await page2.locator("#email").inputValue()) === EXISTING_EMAIL);
    await page2.locator("#password").fill(PASSWORD);
    await page2.getByRole("button", { name: "Sign in" }).click();
    await page2.waitForURL(new RegExp(`/invite/`), { timeout: 10_000 });
    ok(`7. signing in returns the browser to the SAME invitation, unprompted`, page2.url().includes("/invite/"));

    const acceptButton2 = page2.getByRole("button", { name: /Accept and join/ });
    ok(`   the invite page now offers to accept`, await acceptButton2.isVisible());
    await acceptButton2.click();
    await page2.waitForURL(/\/dashboard\/welcome/, { timeout: 10_000 });
    ok(`   accepting lands on the welcome page, naming the SECOND business`, (await page2.textContent("body"))?.includes("Browser Flow Existing Electric") ?? false);

    const membership2 = await prisma.contractorMembership.findFirst({ where: { contractorId: c2.contractorId }, select: { role: true, active: true, user: { select: { email: true } } } });
    ok(`   a live OWNER membership exists for the pre-existing account`, membership2?.role === "OWNER" && membership2.active === true && membership2.user.email === EXISTING_EMAIL);

    await ctx2.close();
  } catch (e) {
    console.error(e);
    fail++;
  } finally {
    // Cleanup runs even if an assertion above threw — a failed run must not
    // leave a real user or a fixture contractor behind for the next one.
    await browser.close().catch(() => {});
    await teardown();
    const residue = await prisma.contractor.count({ where: { slug: { in: [SLUG_NEW, SLUG_EXISTING] } } });
    ok(`8. every fixture is gone at the end`, residue === 0);
    await prisma.$disconnect();
  }

  console.log(`\n  ${fail === 0 ? "done" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
