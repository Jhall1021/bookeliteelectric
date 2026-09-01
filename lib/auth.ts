import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { magicLink } from "better-auth/plugins/magic-link";
import { Resend } from "resend";
import { prisma } from "./prisma";

/**
 * Identity and sessions only.
 *
 * Better Auth owns User, Session, Account and Verification. It does NOT own
 * authorization: which contractors a person may reach is ContractorMembership,
 * and whether they are Price2Book staff is PlatformAccess. Both are ours.
 *
 * The organization plugin is deliberately not enabled. Contractor is already
 * the business entity, with a slug, trade, branding and five configuration
 * relations hanging off it. A parallel Organization would mean mapping
 * between two ideas of the same thing.
 *
 * INVITATION IS NOT LOGIN
 *
 * A ContractorInvitation authorizes someone to JOIN a contractor. A magic
 * link proves WHO they are. They are separate on purpose: an invitation email
 * that doubled as a permanent credential would mean a forwarded or leaked
 * message granting standing access to a contractor's pricing and customers.
 *
 * After an invitation is accepted, every later sign-in uses a freshly issued
 * magic link. The invitation token is spent and never valid again.
 */

/**
 * PLATFORM mail — Price2Book's own, not a contractor's.
 *
 * Sign-in links, invitations and account notices come from Price2Book.
 * Booking confirmations and quote-ready emails come from the contractor.
 * Two senders, two reputations, two Resend accounts, and they must stay
 * independently configurable — collapsing them now would be painful to
 * unpick once contractors have verified their own domains.
 *
 * CONSTRUCTED LAZILY, DELIBERATELY.
 *
 * `new Resend(key)` at module scope would make this file unimportable without
 * the credential — and the Better Auth CLI imports it to generate schema. A
 * missing platform key would then break schema generation and the build,
 * rather than failing when a send is actually attempted.
 *
 * lib/email.ts has exactly that problem today, which is why local builds fail
 * without RESEND_API_KEY. Not repeating it here.
 */
function platformMailer(): { client: Resend; from: string } {
  const key = process.env.PLATFORM_RESEND_API_KEY;
  const from = process.env.PLATFORM_FROM_EMAIL;

  if (!key) {
    throw new Error(
      "PLATFORM_RESEND_API_KEY is not configured — cannot send Price2Book " +
        "sign-in mail. This is the Price2Book Resend account, not the " +
        "contractor's RESEND_API_KEY."
    );
  }
  if (!from) {
    throw new Error(
      'PLATFORM_FROM_EMAIL is not configured — expected something like ' +
        '"Price2Book <notifications@price2book.com>". No fallback sender is ' +
        "used: a sign-in link from the wrong address is worse than none."
    );
  }

  return { client: new Resend(key), from };
}

/**
 * The sign-in email.
 *
 * Minimal and security-shaped on purpose. It contains no contractor name, no
 * personal data and nothing about what the account can reach — a sign-in link
 * that lands in the wrong inbox should reveal as little as possible.
 */
/**
 * One send, one place to get the sender wrong.
 *
 * A DEVELOPMENT SINK, because these emails are the only step of account
 * creation a test cannot perform. Verification and reset tokens are SIGNED,
 * not stored — `createEmailVerificationToken` puts them in the URL and nothing
 * lands in the `verification` table — so there is no row a harness can read to
 * stand in for opening the inbox. Without a sink, proving that a stranger can
 * sign up and verify would mean either mailing a real person or reproducing
 * the library's token signing, and the second is a test that passes while the
 * product is broken.
 *
 * Refuses outright in production: a file containing live sign-in links is
 * exactly the thing not to write, and an env var set by accident should fail
 * loudly rather than quietly divert a contractor's mail.
 */
async function sendPlatformMail(to: string, subject: string, text: string, what: string) {
  const sink = process.env.PLATFORM_MAIL_SINK;
  if (sink) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("PLATFORM_MAIL_SINK is set in production — refusing to divert mail.");
    }
    const { appendFile } = await import("node:fs/promises");
    await appendFile(sink, JSON.stringify({ to, subject, text, at: new Date().toISOString() }) + "\n");
    return;
  }

  const { client, from } = platformMailer();
  const { error } = await client.emails.send({ from, to, subject, text });
  // Throw rather than swallow, for the same reason the magic link does: a
  // silently failed email is a locked-out contractor with nothing to look at.
  if (error) throw new Error(`${what} send failed: ${error.message}`);
}

function verifyEmail(url: string) {
  return {
    subject: "Confirm your email address",
    text: [
      "Welcome to Price2Book. Confirm this address to finish setting up your account.",
      "",
      `Confirm: ${url}`,
      "",
      "If you didn't create a Price2Book account, you can ignore this — nothing " +
        "happens until the link is opened.",
    ].join("\n"),
  };
}

function resetEmail(url: string) {
  return {
    subject: "Reset your Price2Book password",
    text: [
      "Someone asked to reset the password for this Price2Book account.",
      "",
      `Choose a new password: ${url}`,
      "",
      "This link works once and expires in an hour.",
      "",
      "If this wasn't you, nothing has changed and your current password still works.",
    ].join("\n"),
  };
}

function magicLinkEmail(url: string, minutes: number) {
  return {
    subject: "Sign in to Price2Book",
    text: [
      "Someone asked to sign in to Price2Book with this email address.",
      "",
      `Sign in: ${url}`,
      "",
      `This link works once and expires in ${minutes} minutes.`,
      "",
      "If this wasn't you, no action is needed — the link cannot be used " +
        "without opening it, and it will expire on its own.",
    ].join("\n"),
  };
}

/** Long enough for a contractor who checks email between jobs. */
const MAGIC_LINK_MINUTES = 15;

/**
 * Where this deployment lives, resolved rather than pinned.
 *
 * A magic link must return to the deployment that ISSUED it. A single
 * BETTER_AUTH_URL environment variable cannot do that: set it to production
 * and every preview deployment mails links that land on production; set it per
 * environment and it silently rots the first time a variable is copied between
 * them. The failure is quiet either way — the mail sends, the link works, and
 * it signs you in to the wrong place.
 *
 * So Vercel's own deployment host wins when present. VERCEL_BRANCH_URL is
 * preferred over VERCEL_URL because it is the stable branch alias rather than
 * the per-commit URL, which changes on every push and would invalidate links
 * already in someone's inbox.
 *
 * An explicit BETTER_AUTH_URL still overrides everything, for a custom domain.
 */
function resolveBaseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;

  // On production the deployment must identify itself by its PRODUCTION
  // domain, not by the git-main alias. VERCEL_URL is per-commit and
  // VERCEL_BRANCH_URL is the branch alias; neither is the address a person
  // types or that a magic link should return to.
  if (process.env.VERCEL_ENV === "production" && process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }

  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return undefined; // local dev: Better Auth infers from the request
}

/**
 * Every host this deployment may legitimately be reached on.
 *
 * Vercel serves one deployment under several names — a per-commit URL, a
 * branch alias, and on production the project domain. A sign-in started on one
 * must not be refused because the request arrived via another.
 *
 * The production domain was missing from the first version of this list, and
 * production sign-in failed with INVALID_ORIGIN the moment it deployed: the
 * two Vercel variables it did use are both non-production aliases. Caught by
 * requesting a link against production immediately after the deploy, which is
 * the only place that particular gap can show up.
 */
function trustedOrigins(): string[] {
  return [
    process.env.VERCEL_PROJECT_PRODUCTION_URL &&
      `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`,
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.BETTER_AUTH_URL,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);
}

export const auth = betterAuth({
  baseURL: resolveBaseUrl(),

  /**
   * Every host this deployment may legitimately be reached on.
   *
   * Vercel serves a preview at both a per-commit URL and a branch alias, and a
   * sign-in started on one must not be refused because the link came back via
   * the other.
   */
  trustedOrigins: trustedOrigins(),

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  /**
   * PASSWORDS ARE THE NORMAL LOGIN NOW.
   *
   * Magic-link-only was right for a two-contractor pilot and wrong for
   * release: every sign-in cost an inbox round-trip, which is a wall for a
   * contractor between jobs and was a wall in this repo's own proof runs.
   * Magic link keeps two jobs — recovery, and accepting an invitation — where
   * a one-time link is genuinely the better mechanism.
   *
   * Hashing is Better Auth's own (scrypt). Not hand-rolled, and not swapped
   * for something familiar: the library's verifier and the stored format have
   * to agree, and that agreement is not ours to reinvent.
   */
  emailAndPassword: {
    enabled: true,
    // No session until the address is confirmed. A membership is what reaches
    // a tenant's data, and an unverified address must never hold one.
    requireEmailVerification: true,
    // Longer than the usual 8. This is the credential to a business's pricing
    // and its customers' addresses.
    minPasswordLength: 12,
    autoSignIn: false,
    sendResetPassword: async ({ user, url }) => {
      const { subject, text } = resetEmail(url);
      await sendPlatformMail(user.email, subject, text, "Password reset");
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    // Signing them in once they have proved the address saves a second trip
    // through the login form immediately after confirming.
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      const { subject, text } = verifyEmail(url);
      await sendPlatformMail(user.email, subject, text, "Verification email");
    },
  },

  /**
   * Rate limiting, configured rather than assumed.
   *
   * The note at the foot of this file used to say this was deliberately left
   * out because a rate limit that silently does nothing is worse than none —
   * it looks like protection. That reasoning stands, so the acceptance proof
   * exercises these paths rather than trusting the configuration.
   *
   * The credential endpoints are much tighter than the default: guessing a
   * password and enumerating which addresses have accounts are the two things
   * worth slowing down, and neither has a legitimate reason to be fast.
   */
  rateLimit: {
    enabled: true,
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 3600, max: 5 },
      "/forget-password": { window: 3600, max: 5 },
      "/send-verification-email": { window: 3600, max: 5 },
      "/sign-in/magic-link": { window: 3600, max: 5 },
    },
  },

  plugins: [
    magicLink({
      // Better Auth's default is 5 minutes, which is aggressive for someone
      // reading email between jobs on a phone.
      expiresIn: MAGIC_LINK_MINUTES * 60,

      sendMagicLink: async ({ email, url }) => {
        const { subject, text } = magicLinkEmail(url, MAGIC_LINK_MINUTES);
        await sendPlatformMail(email, subject, text, "Magic link");
      },
    }),
  ],
});

/**
 * Rate limiting is configured above and PROVED in
 * scripts/verify-account-bootstrap.ts, which drives the real endpoints until
 * one refuses. That is deliberate: this note previously said the rules were
 * left out because a rate limit that silently does nothing looks like
 * protection, and configuring one without exercising it would have made the
 * comment true instead of fixing it.
 *
 * Still open, and not guessed at here: whether Better Auth's sign-in failure
 * response distinguishes "no such account" from "wrong password". It must not,
 * and the bootstrap proof asserts the two are indistinguishable rather than
 * assuming the library's default is safe.
 */
