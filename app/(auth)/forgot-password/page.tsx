"use client";

import { useState } from "react";
import { requestPasswordReset } from "@/lib/authClient";

/** A one-time link, which is what magic link was always good at. */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await requestPasswordReset({
      email: email.trim().toLowerCase(),
      redirectTo: "/reset-password",
    });
    setSubmitting(false);
    // Shown whether or not the address has an account, for the same reason
    // sign-in gives one answer to both failures.
    setSent(true);
  }

  if (sent) {
    return (
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Check your email</h1>
        <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
          If <span className="font-medium text-p2b-ink">{email}</span> can access an account,
          a link to choose a new password is on its way.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Reset your password</h1>
      <p className="mt-2 text-[15px] leading-[1.6] text-p2b-muted">
        We&rsquo;ll email you a link to choose a new one.
      </p>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="email" required autoComplete="email" autoFocus
          value={email} onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
          placeholder="you@example.com"
        />
        <button
          type="submit" disabled={submitting || !email.trim()}
          className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Email me a reset link"}
        </button>
      </form>
    </div>
  );
}
