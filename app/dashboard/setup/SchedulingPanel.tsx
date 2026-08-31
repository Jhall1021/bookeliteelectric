"use client";

import Link from "next/link";
import type { Finding } from "@/lib/onboardingReadiness";
import SchedulingAuthorityControl from "./SchedulingAuthorityControl";

/**
 * Who owns the calendar, and what that answer requires.
 *
 * Guided Setup writes exactly one thing here — the authority — and links to
 * the surfaces that already own hours, service area and crew. There is no
 * second scheduling engine, and no fallback: if an external calendar is
 * authoritative and we cannot verify a slot against it, we do not offer one.
 */
export default function SchedulingPanel({
  authority, jobberConnected, eligibleCrew, findings,
}: {
  authority: "NATIVE" | "EXTERNAL" | null;
  jobberConnected: boolean;
  eligibleCrew: number;
  findings: Finding[];
}) {
  return (
    <div className="space-y-6">
      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Who owns your calendar?</h2>
        <p className="mt-1 text-sm text-slate">
          This decides what has to be true before a homeowner can pick a time.
        </p>
        <div className="mt-4">
          <SchedulingAuthorityControl authority={authority} />
        </div>
      </section>

      {authority === "EXTERNAL" && (
        <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
          <h2 className="font-display text-lg font-bold text-navy">Your calendar</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div className="flex items-center justify-between border-b border-cardline pb-2">
              <dt className="text-slate">Jobber</dt>
              <dd className="flex items-center gap-3">
                <span className={jobberConnected ? "text-success" : "text-red-600"}>
                  {jobberConnected ? "Connected" : "Not connected"}
                </span>
                <Link href="/dashboard/jobber" className="font-semibold text-electric hover:underline">
                  Open
                </Link>
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-slate">Crew who can take online bookings</dt>
              <dd className="flex items-center gap-3">
                <span className={eligibleCrew > 0 ? "text-success" : "text-red-600"}>
                  {eligibleCrew}
                </span>
                <Link href="/dashboard/jobber/crews" className="font-semibold text-electric hover:underline">
                  Open
                </Link>
              </dd>
            </div>
          </dl>
          {eligibleCrew === 0 && (
            <p className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">
              Your calendar decides availability, but nobody is marked bookable — so every arrival
              window would come back empty. This is a setting, not an empty diary.
            </p>
          )}
        </section>
      )}

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">When and where you work</h2>
        <p className="mt-1 text-sm text-slate">
          {authority === "EXTERNAL"
            ? "Your working hours still shape the windows we offer; your calendar decides which of them are free."
            : "Your working hours and service area decide what a homeowner can book."}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <Link href="/dashboard/business-hours" className="font-semibold text-electric hover:underline">
            Working hours
          </Link>
          <Link href="/dashboard/service-area" className="font-semibold text-electric hover:underline">
            Service area
          </Link>
        </div>
      </section>

      {findings.length > 0 && (
        <section className="rounded-card border border-cardline bg-warmwhite p-5">
          <h3 className="text-sm font-semibold text-navy">
            {findings.some((f) => f.severity === "blocker") ? "Before a homeowner can book" : "Worth a look"}
          </h3>
          <ul className="mt-3 space-y-2">
            {findings.map((f, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                  f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"}`} />
                <span className="text-slate">
                  {f.message}
                  {f.href && f.href !== "/dashboard/setup" && (
                    <Link href={f.href} className="ml-1 font-medium text-electric hover:underline">Fix</Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
