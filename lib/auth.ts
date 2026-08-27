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
  const host = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
  if (host) return `https://${host}`;
  return undefined; // local dev: Better Auth infers from the request
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
  trustedOrigins: [
    process.env.VERCEL_BRANCH_URL && `https://${process.env.VERCEL_BRANCH_URL}`,
    process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
    process.env.BETTER_AUTH_URL,
  ].filter((v): v is string => typeof v === "string" && v.length > 0),

  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

  // Passwords are deliberately NOT enabled. Magic link only for the pilot.
  //
  // No password storage, no reset flow, no "I forgot my password" during a
  // two-contractor pilot. The account model underneath is unaffected, so
  // passkeys can be added later, and passwords too if deliverability turns
  // out to cause real friction. Building both now would be building one of
  // them for nobody.
  emailAndPassword: {
    enabled: false,
  },

  plugins: [
    magicLink({
      // Better Auth's default is 5 minutes, which is aggressive for someone
      // reading email between jobs on a phone.
      expiresIn: MAGIC_LINK_MINUTES * 60,

      sendMagicLink: async ({ email, url }) => {
        const { client, from } = platformMailer();
        const { subject, text } = magicLinkEmail(url, MAGIC_LINK_MINUTES);

        const { error } = await client.emails.send({
          from,
          to: email,
          subject,
          text,
        });

        // Throw rather than swallow. A silently failed sign-in email is a
        // locked-out contractor with nothing to look at — the caller needs to
        // know the send failed so it can say so.
        if (error) {
          throw new Error(`Magic link send failed: ${error.message}`);
        }
      },
    }),
  ],
});

/**
 * NOT YET CONFIGURED, and deliberately left out of this pass:
 *
 *   - resend cooldown and rate limiting on the sign-in endpoint
 *   - generic responses that don't reveal whether an email has an account
 *
 * Both are requirements. Neither is guessed at here, because Better Auth's
 * rate-limit configuration is something to verify against the running
 * library rather than infer — and a rate limit that silently does nothing is
 * worse than one that isn't there, since it looks like protection.
 */
