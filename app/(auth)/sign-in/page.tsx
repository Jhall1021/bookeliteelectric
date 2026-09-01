"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "@/lib/authClient";

/**
 * Contractor sign-in — a password, with a link as the fallback.
 *
 * Magic-link-only was right for a two-contractor pilot and wrong for release:
 * every sign-in cost an inbox round-trip, which is a wall for a contractor
 * between jobs. The link stays, because it is genuinely the better mechanism
 * when someone cannot get in.
 *
 * WHY THE RESPONSE IS THE SAME EITHER WAY
 *
 * Wrong password and no such account produce one message. Distinguishing them
 * turns this form into a way to test which email addresses can reach a
 * contractor's pricing and customers — which was already true of the link
 * flow, and is more tempting to get wrong with passwords.
 */
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsVerify, setNeedsVerify] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePassword(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setNeedsVerify(false);

    const { error } = await signIn.email({
      email: email.trim().toLowerCase(),
      password,
      callbackURL: "/dashboard",
    });

    setSubmitting(false);
    if (error) {
      // The one distinction worth drawing: an unverified address is a state
      // the person can act on, and telling them so reveals nothing an attacker
      // could not learn by signing up with that address themselves.
      if (error.status === 403) { setNeedsVerify(true); return; }
      setError("That email and password don't match an account.");
      return;
    }
    window.location.href = "/dashboard";
  }

  async function emailALink() {
    setSubmitting(true);
    setError(null);
    await signIn.magicLink({
      email: email.trim().toLowerCase(),
      callbackURL: "/dashboard",
    });
    setSubmitting(false);
    setLinkSent(true);
  }

  if (linkSent) {
    return (
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Check your email</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
          If <span className="font-medium text-p2b-ink">{email}</span> can access an account,
          a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => setLinkSent(false)}
          className="mt-6 text-[15px] font-semibold text-p2b-accent underline underline-offset-2 hover:text-p2b-accent-hover"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Sign in</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-p2b-muted">
        Welcome back to Price2Book.
      </p>

      <form onSubmit={handlePassword} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-[14px] font-medium text-p2b-ink">Email address</label>
          <input
            id="email" type="email" required autoComplete="email" autoFocus
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="text-[14px] font-medium text-p2b-ink">Password</label>
          <input
            id="password" type="password" required autoComplete="current-password"
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
          />
        </div>

        {needsVerify && (
          <div className="rounded-sm border border-p2b-line bg-p2b-amber-tint p-3 text-sm text-p2b-amber-ink">
            Confirm your email address first — check your inbox for the link we sent
            when you signed up.
          </div>
        )}
        {error && (
          <div className="rounded-sm border border-p2b-error-line bg-p2b-error-bg p-3 text-sm text-p2b-error-ink">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim() || !password}
          className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-[14px]">
        <Link href="/forgot-password" className="font-semibold text-p2b-accent underline underline-offset-2">
          Forgot your password?
        </Link>
        <button
          type="button"
          onClick={emailALink}
          disabled={!email.trim() || submitting}
          className="font-semibold text-p2b-accent underline underline-offset-2 disabled:opacity-50"
        >
          Email me a link instead
        </button>
        <Link href="/sign-up" className="font-semibold text-p2b-accent underline underline-offset-2">
          Create an account
        </Link>
      </div>
    </div>
  );
}
