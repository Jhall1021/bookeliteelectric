"use client";

import { useState } from "react";
import { sendVerificationEmail } from "@/lib/authClient";

/** Signed in as the right address, but it isn't confirmed yet. One resend, same terms as sign-up's own verification email. */
export function ResendVerification({ email, path }: { email: string; path: string }) {
  const [sent, setSent] = useState(false);
  if (sent) {
    return <p className="mt-3 text-sm text-p2b-muted">Sent. Open the link, then come back to this page.</p>;
  }
  return (
    <button
      type="button"
      onClick={async () => { await sendVerificationEmail({ email, callbackURL: path }); setSent(true); }}
      className="mt-3 text-sm font-semibold text-p2b-accent underline underline-offset-2"
    >
      Resend the confirmation email
    </button>
  );
}
