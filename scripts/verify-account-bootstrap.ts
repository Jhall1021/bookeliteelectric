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
async function linkFor(email: string, subjectMatch?: RegExp): Promise<string | null> {
  const { readFile } = await import("node:fs/promises");
  let raw = "";
  try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      try { return JSON.parse(l) as { to: string; subject: string; text: string }; }
      catch { return null; }
    })
    .filter((m): m is { to: string; subject: string; text: string } =>
      m !== null && m.to === email && (!subjectMatch || subjectMatch.test(m.subject)));
  const last = mine.at(-1);
  if (!last) return null;
  return last.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

const verificationLinkFor = (email: string) => linkFor(email, /confirm/i);

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const jar: string[] = [];
async function call(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string>; jar?: string[] }
) {
  const cookies = init?.jar ?? jar;
  const res = await fetch(BASE + path, {
    method: init?.method ?? (init?.body ? "POST" : "GET"),
    headers: {
      "content-type": "application/json",
      // REQUIRED, and correctly so. Better Auth refuses a credential request
      // with no Origin — MISSING_OR_NULL_ORIGIN — which is its CSRF check
      // working, not an obstacle to route around. A browser always sends one;
      // a script has to say who it is.
      origin: BASE,
      cookie: cookies.join("; "),
      ...(init?.headers ?? {}),
    },
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

/**
 * Sign in, waiting out the rate limit rather than failing on it.
 *
 * The window is 60 seconds and this proof deliberately exhausts it at the end,
 * so a second run inside a minute met a 429 on its FIRST sign-in and reported
 * a broken password. That is the check misreading the protection it exists to
 * confirm — throttling is a "not yet", not a refusal, and only the probe at
 * the end is entitled to treat a 429 as the answer it wanted.
 */
async function signIn(email: string, password: string, jar?: string[]) {
  const first = await call("/api/auth/sign-in/email", { body: { email, password }, jar });
  if (first.status !== 429) return first;
  console.log(`     (rate-limited — waiting out the window)`);
  await new Promise((r) => setTimeout(r, 61_000));
  return call("/api/auth/sign-in/email", { body: { email, password }, jar });
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
  const signedIn = await signIn(EMAIL, PASSWORD);
  ok(`4. the password signs the account in`, signedIn.status === 200,
    `${signedIn.status} ${signedIn.text.slice(0, 90)}`);

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
  ok(`   it has a storefront identity`, site?.hostedSlug === SLUG && !!site?.publicId?.startsWith("site_"));

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

  // ── 11. a confirmation link cannot be replayed into a session ──────────
  //
  // The token is signed, not stored, so nothing marks it used. What must not
  // happen is that opening it again — from a forwarded email, a shared device,
  // a browser history — hands someone a fresh authenticated session for the
  // account. Checked with an EMPTY cookie jar, which is what an attacker
  // holding only the link has.
  const stranger: string[] = [];
  await call(link.replace(BASE, ""), { jar: stranger });
  const strangerReach = await call("/dashboard/setup", { jar: stranger });
  ok(`11. replaying the confirmation link grants no session`,
    strangerReach.status !== 200,
    `${strangerReach.status} — a replayed link reached the dashboard`);

  // ── 12. a reset link is spent once the password changes ────────────────
  const reset = await call("/api/auth/request-password-reset", {
    body: { email: EMAIL, redirectTo: "/reset-password" },
  });
  ok(`12. a password reset can be requested`, reset.status === 200, String(reset.status));

  const resetLink = await linkFor(EMAIL, /reset/i);
  ok(`    and arrives as a link`, resetLink !== null);
  const resetToken = resetLink?.match(/[?&]token=([^&]+)/)?.[1]
    ?? resetLink?.split("/").pop()?.split("?")[0] ?? null;
  ok(`    carrying a token`, !!resetToken);

  if (resetToken) {
    const NEW_PASSWORD = "a-different-correct-horse-9";
    const first = await call("/api/auth/reset-password", {
      body: { newPassword: NEW_PASSWORD, token: resetToken },
    });
    ok(`    the password changes once`, first.status === 200, `${first.status} ${first.text.slice(0, 90)}`);

    const replay = await call("/api/auth/reset-password", {
      body: { newPassword: "third-password-entirely-99", token: resetToken },
    });
    ok(`13. the same reset token cannot be used again`, replay.status !== 200,
      `${replay.status} — a spent reset link changed the password a second time`);

    // And the change really took: the old password stops working.
    // NOT merely "non-200". Throttling also answers non-200, and an earlier
    // draft ran this after the rate-limit probe had already exhausted the
    // window — so it passed on a 429 and proved nothing about the password.
    const oldPw = await signIn(EMAIL, PASSWORD);
    ok(`    the old password no longer signs in`,
      oldPw.status !== 200 && oldPw.status !== 429,
      `${oldPw.status}${oldPw.status === 429 ? " — throttled, so this proved nothing" : ""}`);
  }

  // ── 14. a garbage or expired token is refused ──────────────────────────
  //
  // Signed tokens fail closed on a bad signature the same way they fail on an
  // expired claim — both are "this did not come from us, intact". A forged one
  // stands in for an expired one, which cannot be manufactured without waiting.
  const forged = await call("/api/auth/verify-email?token=not.a.real.token&callbackURL=/start");
  ok(`14. a token that did not come from us is refused`,
    forged.status !== 200 || /invalid|error/i.test(forged.text),
    `${forged.status} ${forged.text.slice(0, 90)}`);

  const forgedReset = await call("/api/auth/reset-password", {
    body: { newPassword: "should-never-be-set-1234", token: "not.a.real.token" },
  });
  ok(`    and so is a forged reset token`, forgedReset.status !== 200, String(forgedReset.status));

  // ── 15. a revoked session cannot reach contractor-admin surfaces ───────
  const live: string[] = [];
  const freshSignIn = await signIn(EMAIL, "a-different-correct-horse-9", live);
  ok(`15. the new password signs in`, freshSignIn.status === 200, String(freshSignIn.status));

  const beforeRevoke = await call("/dashboard/setup", { jar: live });
  ok(`    and reaches the dashboard`, beforeRevoke.status === 200, String(beforeRevoke.status));

  await call("/api/auth/sign-out", { method: "POST", body: {}, jar: live });
  const afterRevoke = await call("/dashboard/setup", { jar: live });
  ok(`    revoking it closes the dashboard`, afterRevoke.status !== 200,
    `${afterRevoke.status} — a revoked session still reached contractor admin`);

  // ── 16. the credential endpoint rate-limits ────────────────────────────
  //
  // LAST ON PURPOSE. Exhausting the window makes every later sign-in answer
  // 429, which is indistinguishable from a refusal — an earlier ordering had
  // the revocation and old-password checks passing on throttling rather than
  // on the thing they name.
  //
  // Exercised, not read off the configuration: a rate limit that silently does
  // nothing looks exactly like protection, which is why lib/auth.ts refused to
  // claim one until it was proved.
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) {
    const r = await call("/api/auth/sign-in/email", {
      body: { email: EMAIL, password: `wrong-${i}` },
    });
    if (r.status === 429) limited = true;
  }
  ok(`16. repeated password attempts are refused with 429`, limited,
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
