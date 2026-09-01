"use client";

import { useState } from "react";
import Link from "next/link";
import { signUp } from "@/lib/authClient";

/**
 * Creating a Price2Book account.
 *
 * The account and the business are separate steps on purpose. This creates a
 * person; /start creates the contractor they own. Collapsing them would mean
 * writing a tenant membership for an address nobody has confirmed yet.
 */
export default function SignUpPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const { error } = await signUp.email({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      callbackURL: "/start",
    });

    setSubmitting(false);
    if (error) {
      // Deliberately not "that email is already registered": this form would
      // otherwise answer which addresses have accounts, which is the thing
      // sign-in goes to some trouble not to reveal.
      setError(
        error.message?.toLowerCase().includes("password")
          ? "Please choose a password of at least 12 characters."
          : "We couldn't create that account. Check the details and try again."
      );
      return;
    }
    setDone(true);
  }

  if (done) {
    return (
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Confirm your email</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
          We&rsquo;ve sent a link to <span className="font-medium text-p2b-ink">{email}</span>.
          Open it and we&rsquo;ll take you straight to setting up your business.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Create your account</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-p2b-muted">
        Then we&rsquo;ll set up your business and your pricing.
      </p>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label htmlFor="name" className="text-[14px] font-medium text-p2b-ink">Your name</label>
          <input
            id="name" required autoComplete="name" autoFocus
            value={name} onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
          />
        </div>
        <div>
          <label htmlFor="email" className="text-[14px] font-medium text-p2b-ink">Email address</label>
          <input
            id="email" type="email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
            placeholder="you@example.com"
          />
        </div>
        <div>
          <label htmlFor="password" className="text-[14px] font-medium text-p2b-ink">Password</label>
          <input
            id="password" type="password" required autoComplete="new-password" minLength={12}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
          />
          <p className="mt-1 text-[13px] text-p2b-muted">At least 12 characters.</p>
        </div>

        {error && (
          <div className="rounded-sm border border-p2b-error-line bg-p2b-error-bg p-3 text-sm text-p2b-error-ink">{error}</div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !email.trim() || password.length < 12}
          className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-5 text-[14px]">
        <Link href="/sign-in" className="font-semibold text-p2b-accent underline underline-offset-2">
          Already have an account?
        </Link>
      </p>
    </div>
  );
}
