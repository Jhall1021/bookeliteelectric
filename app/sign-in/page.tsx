"use client";

import { useState } from "react";
import { signIn } from "@/lib/authClient";

/**
 * Contractor sign-in — a magic link, not a password.
 *
 * `/sign-in`, not `/admin/login`. The people using this are contractors
 * signing in to their own business's controls, not administrators of a system,
 * and the URL is part of what the product tells them it is. `/admin/login`
 * still resolves for anyone who bookmarked it.
 *
 * The shared password this replaces gave everyone the same credential and
 * proved nothing about who was using it. A link proves an address, and the
 * address is what ContractorMembership grants access through.
 *
 * WHY THE RESPONSE IS THE SAME EITHER WAY
 *
 * "Check your email" is shown whether or not the address has an account.
 * Saying "no such user" turns this form into a way to test which email
 * addresses can reach a contractor's pricing and customers.
 */
export default function SignInPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await signIn.magicLink({
      email: email.trim().toLowerCase(),
      // Relative: the link returns to whichever deployment issued it.
      callbackURL: "/dashboard",
    });

    setSubmitting(false);
    if (error) {
      // A send failure is worth showing — a silently failed sign-in email is
      // someone staring at an empty inbox with nothing to act on.
      setError("We couldn't send the link just now. Please try again.");
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Check your email</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
          If <span className="font-medium text-p2b-ink">{email}</span> can access an account,
          a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); setEmail(""); }}
          className="mt-6 text-[15px] font-semibold text-p2b-accent underline underline-offset-2 hover:text-p2b-accent-hover"
        >
          Use a different address
        </button>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Sign in</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-p2b-muted">
        We&rsquo;ll email you a link. No password to remember.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-[14px] font-medium text-p2b-ink">
            Email address
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <div className="rounded-sm border border-p2b-error-line bg-p2b-error-bg p-3 text-sm text-p2b-error-ink">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </div>
  );
}
