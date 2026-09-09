"use client";

import { useRouter } from "next/navigation";
import { signOut } from "@/lib/authClient";

/** Signed in as the wrong address for this invitation. Sign out and reload the same invite page, so the sign-in/sign-up choice comes back. */
export function SignOutRetry({ path }: { path: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={async () => { await signOut(); router.push(path); router.refresh(); }}
      className="mt-3 text-sm font-semibold text-p2b-accent underline underline-offset-2"
    >
      Sign out and try a different account
    </button>
  );
}
