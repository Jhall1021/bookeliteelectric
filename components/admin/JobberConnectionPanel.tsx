"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JobberConnectionPanel({
  isConnected,
  connectedAt,
  justConnected,
  error,
}: {
  isConnected: boolean;
  connectedAt: string | null;
  justConnected: boolean;
  error?: string;
}) {
  const router = useRouter();
  const [disconnecting, setDisconnecting] = useState(false);

  async function handleDisconnect() {
    setDisconnecting(true);
    await fetch("/api/admin/jobber/disconnect", { method: "POST" });
    router.refresh();
    setDisconnecting(false);
  }

  return (
    <div className="mt-6 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
      {justConnected && (
        <div className="mb-4 rounded-card bg-success/10 p-3 text-sm text-success">
          ✓ Successfully connected to Jobber.
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-card bg-red-50 p-3 text-sm text-red-600">
          Connection failed ({error}). Try again, or double-check the Client ID/Secret in Vercel.
        </div>
      )}

      {isConnected ? (
        <>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-success" />
            <span className="font-semibold text-navy">Connected</span>
          </div>
          {connectedAt && (
            <p className="mt-1 text-sm text-slate">
              Since {new Date(connectedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          )}
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="mt-4 rounded-pill border border-cardline px-5 py-2 text-sm font-medium text-navy hover:bg-warmwhite disabled:opacity-50"
          >
            {disconnecting ? "Disconnecting..." : "Disconnect"}
          </button>
        </>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-slate" />
            <span className="font-semibold text-navy">Not connected</span>
          </div>
          {/* Single-tenant leftover, fixed: this used to read "your real Elite
              Electric account", which every contractor saw. Nothing here knows
              whose account it is, and it does not need to — "your own Jobber
              account" is true for whoever is reading it. */}
          <p className="mt-2 text-sm text-slate">
            You&rsquo;ll be sent to Jobber to log in with your own Jobber account and approve
            access.
          </p>
          <a
            href="/api/admin/jobber/connect"
            className="mt-4 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover"
          >
            Connect to Jobber
          </a>
        </>
      )}
    </div>
  );
}
