/**
 * A stranger can become a contractor without anyone touching the database.
 *
 *   npx tsx scripts/verify-account-bootstrap.ts        (needs the dev server)
 *
 * THE GAP THIS CLOSES
 *
 * Invitation into an existing contractor was built. A brand-new person
 * creating their own tenant was not, so the BrightPath proof needed a
 * membership written by hand — acceptable for a fixture, and not acceptable
 * for release, because a hand-written membership is a tenant grant nobody
 * reviewed.
 *
 * WHAT COUNTS AS PASSING
 *
 * Every state change below goes through a product HTTP endpoint. No row is
 * created, updated or deleted by this script except the teardown of what it
 * created, which runs whether or not the run succeeds.
 *
 * READING THE EMAIL, and why it is not a shortcut
 *
 * Opening the inbox is the one step a script cannot perform, so the dev server
 * writes mail to a sink file instead of sending it (PLATFORM_MAIL_SINK, which
 * lib/auth refuses in production). This reads the verification link out of
 * that file exactly as a person reads it out of their inbox, and then redeems
 * it through the real endpoint.
 *
 * It is NOT read from the database, because there is nothing there to read:
 * verification and reset tokens are signed, not stored. The first version of
 * this proof looked in the `verification` table, found it empty, and would
 * have been rewritten to mint its own token — a test that passes by
 * reimplementing the thing it is meant to check.
 */

import { PrismaClient } from "@prisma/client";
import { destroyContractor } from "./_throwaway";

const prisma = new PrismaClient();
const BASE = process.env.BOOTSTRAP_BASE_URL ?? "http://localhost:3000";

// Resend's own sink address. Deliverable, so the verification send genuinely
// succeeds, and it reaches nobody. A made-up domain would fail the send and
// prove something about Resend rather than about this flow.
const stamp = process.env.BOOTSTRAP_STAMP ?? String(process.hrtime.bigint()).slice(-9);
const EMAIL = `p2b-bootstrap-${stamp}@resend.dev`;
const PASSWORD = "correct-horse-battery-staple-9";
const BUSINESS = `Bootstrap Electric ${stamp}`;
const SLUG = `bootstrap-electric-${stamp}`;

const SINK = process.env.PLATFORM_MAIL_SINK ?? "/tmp/p2b-mail.jsonl";

/**
 * The most recent link Price2Book emailed this address.
 *
 * Reads the dev sink the same way a person reads their inbox: find the message
 * addressed to them, take the URL out of it.
 */
async function verificationLinkFor(email: string): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  let raw = "";
  try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { to: string; text: string }; } catch { return null; } })
    .filter((m): m is { to: string; text: string } => m !== null && m.to === email);
  const last = mine.at(-1);
  if (!last) return null;
  return last.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const jar: string[] = [];
async function call(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
) {
  const res = await fetch(BASE + path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      // REQUIRED, and correctly so. Better Auth refuses a credential request
      // with no Origin — MISSING_OR_NULL_ORIGIN — which is its CSRF check
      // working, not an obstacle to route around. A browser always sends one;
      // a script has to say who it is.
      origin: BASE,
      cookie: jar.join("; "),
      ...(init?.headers ?? {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
    redirect: "manual",
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const kv = c.split(";")[0];
    const name = kv.split("=")[0];
    const i = jar.findIndex((e) => e.startsWith(`${name}=`));
    if (i >= 0) jar[i] = kv; else jar.push(kv);
  }
  const text = await res.text();
  let body: unknown = text;
  try { body = JSON.parse(text); } catch { /* html or redirect */ }
  return { status: res.status, body, text, location: res.headers.get("location") };
}

async function teardown() {
  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
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
  console.log(`\nACCOUNT BOOTSTRAP — a stranger becomes a contractor\n`);
  console.log(`  ${EMAIL}\n`);
  await teardown();

  // ── 1. sign up ─────────────────────────────────────────────────────────
  const signUp = await call("/api/auth/sign-up/email", {
    body: { name: "Bootstrap Owner", email: EMAIL, password: PASSWORD, callbackURL: "/start" },
  });
  ok(`1. a brand-new address can create an account`, signUp.status === 200, `${signUp.status} ${signUp.text.slice(0, 120)}`);

  const created = await prisma.user.findFirst({
    where: { email: EMAIL }, select: { id: true, emailVerified: true },
  });
  ok(`   the account exists and is NOT yet verified`, created !== null && created.emailVerified === false,
    created ? `emailVerified=${created.emailVerified}` : "no user row");

  // A password was stored, and stored hashed. Not the algorithm — that is
  // Better Auth's — but that the plaintext is nowhere in the row.
  const account = await prisma.account.findFirst({
    where: { userId: created?.id ?? "" }, select: { password: true },
  });
  ok(`   the password is hashed, not stored`,
    !!account?.password && !account.password.includes(PASSWORD) && account.password.length > 40);

  // ── 2. an unverified account may not create a tenant ───────────────────
  const early = await call("/api/contractors", { body: { name: BUSINESS, slug: SLUG } });
  ok(`2. an unverified account is refused a contractor`,
    early.status === 401 || early.status === 403,
    `${early.status} ${early.text.slice(0, 90)}`);

  // ── 3. verify, by opening the link we were sent ────────────────────────
  const link = await verificationLinkFor(EMAIL);
  ok(`3. a confirmation email was sent with a link`, link !== null,
    `nothing addressed to ${EMAIL} in ${SINK}`);
  if (!link) throw new Error("no verification email — cannot continue");

  const verified = await call(link.replace(BASE, ""));
  ok(`   opening it verifies the address`, verified.status === 200 || verified.status === 302,
    String(verified.status));

  const afterVerify = await prisma.user.findFirstOrThrow({
    where: { email: EMAIL }, select: { id: true, emailVerified: true },
  });
  ok(`   and the account is now verified`, afterVerify.emailVerified === true);

  // ── 4. sign in with the password ───────────────────────────────────────
  const signIn = await call("/api/auth/sign-in/email", {
    body: { email: EMAIL, password: PASSWORD },
  });
  ok(`4. the password signs the account in`, signIn.status === 200, `${signIn.status} ${signIn.text.slice(0, 90)}`);

  // ── 5. create the contractor, through the sanctioned route ─────────────
  const before = await prisma.contractorMembership.count({ where: { userId: afterVerify.id } });
  ok(`5. the account belongs to no contractor yet`, before === 0, String(before));

  const create = await call("/api/contractors", { body: { name: BUSINESS, slug: SLUG } });
  ok(`   POST /api/contractors creates one`, create.status === 200, `${create.status} ${create.text.slice(0, 140)}`);

  // ── 6. the transaction made a COMPLETE tenant ──────────────────────────
  const contractor = await prisma.contractor.findFirst({
    where: { slug: SLUG }, select: { id: true, name: true, active: true },
  });
  ok(`6. the contractor exists and is active`, contractor?.active === true);

  const membership = await prisma.contractorMembership.findFirst({
    where: { userId: afterVerify.id, contractorId: contractor?.id ?? "" },
    select: { role: true, active: true },
  });
  ok(`   the account is its OWNER`, membership?.role === "OWNER" && membership.active === true,
    membership ? `${membership.role} active=${membership.active}` : "no membership");

  const site = await prisma.contractorSite.findFirst({
    where: { contractorId: contractor?.id ?? "" }, select: { hostedSlug: true, publicId: true },
  });
  ok(`   it has a storefront identity`, site?.hostedSlug === SLUG && !!site?.publicId?.startsWith("pub_"));

  const onboarding = await prisma.contractorOnboarding.findFirst({
    where: { contractorId: contractor?.id ?? "" }, select: { currentStage: true },
  });
  ok(`   and Guided Setup has somewhere to resume`, onboarding !== null,
    onboarding ? onboarding.currentStage : "no onboarding row");

  // ── 7. Guided Setup is reachable, as this contractor ────────────────────
  const setup = await call("/dashboard/setup");
  ok(`7. /dashboard/setup renders for the new owner`,
    setup.status === 200 && setup.text.includes(BUSINESS),
    `${setup.status}${setup.status === 200 ? " but the business name is absent" : ""}`);

  // ── 8. a second contractor is refused ──────────────────────────────────
  const second = await call("/api/contractors", { body: { name: `${BUSINESS} Two`, slug: `${SLUG}-two` } });
  ok(`8. the same account cannot create a second contractor`, second.status === 400,
    `${second.status} ${second.text.slice(0, 90)}`);

  // ── 9. the two sign-in failures are indistinguishable ──────────────────
  //
  // Wrong password and no such account must not be tellable apart, or this
  // form answers which addresses can reach a contractor's pricing and
  // customers. Asserted rather than assumed of the library's default.
  const wrongPassword = await call("/api/auth/sign-in/email", {
    body: { email: EMAIL, password: "not-the-right-password-at-all" },
  });
  const noSuchAccount = await call("/api/auth/sign-in/email", {
    body: { email: `p2b-absent-${stamp}@resend.dev`, password: "not-the-right-password-at-all" },
  });
  ok(`9. wrong password and unknown account answer alike`,
    wrongPassword.status === noSuchAccount.status,
    `${wrongPassword.status} vs ${noSuchAccount.status}`);

  // ── 10. the credential endpoint rate-limits ────────────────────────────
  //
  // Exercised, not read off the configuration. A rate limit that silently
  // does nothing looks exactly like protection, which is why lib/auth.ts
  // refused to claim one until it was proved.
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await call("/api/auth/sign-in/email", {
      body: { email: EMAIL, password: `wrong-${i}` },
    });
    if (r.status === 429) limited = true;
  }
  ok(`10. repeated password attempts are refused with 429`, limited,
    "twelve attempts went through unthrottled");

  await teardown();
  const gone = await prisma.user.count({ where: { email: EMAIL } });
  ok(`    the probe cleaned up after itself`, gone === 0);

  console.log();
  console.log(fail
    ? `  ${fail} check(s) failed.\n`
    : `  A stranger can sign up, verify, create a business and reach setup.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await teardown().catch(() => {});
  await prisma.$disconnect();
  process.exit(1);
});
