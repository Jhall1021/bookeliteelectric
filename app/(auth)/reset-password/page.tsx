"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetPassword } from "@/lib/authClient";

function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error } = await resetPassword({ newPassword: password, token });
    setSubmitting(false);
    if (error) {
      setError("That link has expired or has already been used. Ask for a new one.");
      return;
    }
    setDone(true);
  }

  if (!token) {
    return <p className="text-[15px] text-p2b-muted">This link is incomplete. Ask for a new one.</p>;
  }
  if (done) {
    return (
      <div>
        <h1 className="text-[30px] font-bold tracking-[-0.022em]">Password changed</h1>
        <p className="mt-3 text-[15px] text-p2b-muted">
          You can now sign in with your new password.
        </p>
        <a href="/sign-in" className="mt-6 inline-block font-semibold text-p2b-accent underline underline-offset-2">
          Sign in
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-[30px] font-bold tracking-[-0.022em] lg:text-[34px]">Choose a new password</h1>
      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <input
          type="password" required autoComplete="new-password" minLength={12} autoFocus
          value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-sm border border-p2b-line bg-white px-4 py-3 text-[15px] focus:border-p2b-accent focus:outline-none focus:ring-1 focus:ring-p2b-accent"
          placeholder="At least 12 characters"
        />
        {error && (
          <div className="rounded-sm border border-p2b-error-line bg-p2b-error-bg p-3 text-sm text-p2b-error-ink">{error}</div>
        )}
        <button
          type="submit" disabled={submitting || password.length < 12}
          className="w-full rounded-sm bg-p2b-accent px-4 py-3.5 text-base font-semibold text-white hover:bg-p2b-accent-hover disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Change my password"}
        </button>
      </form>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetForm />
    </Suspense>
  );
}
