"use client";

import { useState } from "react";
import { signIn } from "@/lib/authClient";

/**
 * Admin sign-in — a magic link, not a password.
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
export default function AdminLoginPage() {
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
      callbackURL: "/admin",
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
      <main className="mx-auto max-w-sm px-6 py-20">
        <h1 className="font-display text-2xl font-bold text-navy">Check your email</h1>
        <p className="mt-3 text-sm text-slate">
          If <span className="font-medium text-navy">{email}</span> can access an account,
          a sign-in link is on its way. It works once and expires in 15 minutes.
        </p>
        <button
          type="button"
          onClick={() => { setSent(false); setEmail(""); }}
          className="mt-6 text-sm font-semibold text-electric underline"
        >
          Use a different address
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-sm px-6 py-20">
      <h1 className="font-display text-2xl font-bold text-navy">Sign in</h1>
      <p className="mt-1 text-sm text-slate">
        We&rsquo;ll email you a link. No password to remember.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="email" className="text-sm font-medium text-navy">
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
            className="mt-1 w-full rounded-card border border-cardline px-3 py-2"
            placeholder="you@example.com"
          />
        </div>

        {error && (
          <div className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !email.trim()}
          className="w-full rounded-full bg-electric px-4 py-2 font-semibold text-white disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Email me a sign-in link"}
        </button>
      </form>
    </main>
  );
}
