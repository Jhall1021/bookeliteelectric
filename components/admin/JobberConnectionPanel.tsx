"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const JOBBER_ERROR_MESSAGES: Record<string, string> = {
  invalid_state:
    "That Jobber connection attempt expired or could not be verified. Start the connection again.",
  contractor_changed:
    "The selected contractor changed while Jobber was connecting. Switch back to the company you want to connect, then start again.",
  not_configured:
    "Jobber is not configured for this Price2Book environment yet. Nothing was connected.",
  exchange_failed:
    "Jobber did not complete the connection. Start again; no contractor connection was changed.",
};

function jobberErrorMessage(error?: string): string | null {
  if (!error) return null;
  return JOBBER_ERROR_MESSAGES[error] ?? "Jobber did not complete the connection. Nothing was changed; try again.";
}

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
  const [disconnectError, setDisconnectError] = useState<string | null>(null);
  const connectionError = jobberErrorMessage(error);

  async function handleDisconnect() {
    if (disconnecting) return;
    setDisconnecting(true);
    setDisconnectError(null);

    try {
      const res = await fetch("/api/admin/jobber/disconnect", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setDisconnectError(
          typeof data.error === "string"
            ? data.error
            : "Could not disconnect Jobber. Nothing was changed."
        );
        return;
      }

      router.refresh();
    } catch {
      setDisconnectError(
        "Could not reach Price2Book. Check your connection and try again; nothing was changed."
      );
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite/55 px-5 py-4 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate">Connection status</p>
            <div className="mt-1 flex items-center gap-2">
              <span className={`h-2.5 w-2.5 rounded-full ${isConnected ? "bg-success" : "bg-slate/40"}`} />
              <h2 className="font-display text-lg font-bold text-navy">{isConnected ? "Jobber connected" : "Jobber not connected"}</h2>
            </div>
          </div>
          <span className={`w-fit rounded-pill px-3 py-1 text-xs font-semibold ${isConnected ? "bg-success/10 text-success" : "bg-white text-slate ring-1 ring-cardline"}`}>
            {isConnected ? "Connected" : "Not connected"}
          </span>
        </div>
      </div>

      <div className="p-5 sm:p-6">
        {justConnected && (
          <div className="mb-4 rounded-card border border-success/20 bg-success/[0.06] px-4 py-3 text-sm font-medium text-success">
            Successfully connected to Jobber.
          </div>
        )}
        {connectionError && (
          <div role="alert" className="mb-4 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {connectionError}
          </div>
        )}
        {disconnectError && (
          <div role="alert" className="mb-4 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {disconnectError}
          </div>
        )}

        {isConnected ? (
          <>
            <p className="max-w-2xl text-sm leading-relaxed text-slate">
              Price2Book can hand booked work to this contractor&apos;s Jobber account. Jobber remains the operational system for dispatch and scheduling.
            </p>
            {connectedAt && (
              <p className="mt-3 text-xs text-slate">
                Connected since {new Date(connectedAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}.
              </p>
            )}
            <div className="mt-5 border-t border-cardline pt-5">
              <button
                type="button"
                onClick={handleDisconnect}
                disabled={disconnecting}
                className="inline-flex min-h-11 items-center justify-center rounded-pill border border-cardline px-5 py-2.5 text-sm font-semibold text-navy transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {disconnecting ? "Disconnecting…" : "Disconnect Jobber"}
              </button>
              <p className="mt-2 max-w-2xl text-xs leading-relaxed text-slate">
                Disconnecting stops Price2Book from using this Jobber connection and clears the synced crew cache used for website-capacity checks. It does not delete anything in Jobber. If you reconnect later, sync the crew list and choose eligible people again.
              </p>
            </div>
          </>
        ) : (
          <>
            <p className="max-w-2xl text-sm leading-relaxed text-slate">
              You&apos;ll be sent to Jobber to sign in with your own account and approve access. Price2Book keeps contractor connections separate so one company&apos;s bookings can never be sent through another company&apos;s integration.
            </p>
            <a
              href="/api/admin/jobber/connect"
              className="mt-5 inline-flex min-h-11 items-center justify-center rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover"
            >
              Connect to Jobber
            </a>
          </>
        )}
      </div>
    </div>
  );
}
