import { withAdminContractor } from "@/lib/adminContext";
import { assessOnboarding, type Stage } from "@/lib/onboardingReadiness";
import Link from "next/link";

export const dynamic = "force-dynamic";

/**
 * Guided Setup — read only, for now.
 *
 * It renders what the systems that own each rule already say. It writes
 * nothing, approves nothing and activates nothing: every "fix this" is a link
 * to the screen that already does that job, because a price approved from here
 * would be a price nobody pressed a button for.
 */

const TONE: Record<Stage["status"], { dot: string; label: string; text: string }> = {
  blocked: { dot: "bg-red-500", label: "Needs attention", text: "text-red-700" },
  warning: { dot: "bg-amber-400", label: "Worth a look", text: "text-amber-800" },
  incomplete: { dot: "bg-slate/40", label: "Not started", text: "text-slate" },
  ready: { dot: "bg-success", label: "Ready", text: "text-success" },
};

export default async function SetupPage() {
  return withAdminContractor(async (db, ctx) => {
    const r = await assessOnboarding(db, ctx.contractorId);

    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-bold text-navy">Set up your storefront</h1>
        <p className="mt-1 text-sm text-slate">
          Everything a homeowner needs before they can price and book with you.
        </p>

        <div
          className={`mt-6 rounded-card border p-5 ${
            r.canLaunch ? "border-success/40 bg-success/5" : "border-cardline bg-warmwhite"
          }`}
        >
          <div className="font-display text-lg font-bold text-navy">
            {r.canLaunch ? "You're ready to take bookings" : `${r.blockers.length} thing${r.blockers.length === 1 ? "" : "s"} to sort out first`}
          </div>
          <p className="mt-1 text-sm text-slate">
            {r.canLaunch
              ? "A homeowner can price and book one of your services right now."
              : "Until these are done, a homeowner cannot complete a booking."}
            {r.warnings.length > 0 && ` ${r.warnings.length} other thing${r.warnings.length === 1 ? " is" : "s are"} worth a look, but nothing is stopping you.`}
          </p>
          {r.intended.length > 0 && (
            <p className="mt-2 text-xs text-slate">
              Checked against {r.intended.length} service{r.intended.length === 1 ? "" : "s"} you look ready to sell.
            </p>
          )}
        </div>

        <ol className="mt-8 space-y-4">
          {r.stages.map((s, i) => {
            const tone = TONE[s.status];
            return (
              <li key={s.key} className="rounded-card border border-cardline bg-white p-5 shadow-card">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
                    <div>
                      <div className="font-medium text-navy">
                        <span className="text-slate">{i + 1}. </span>{s.title}
                      </div>
                      <div className={`text-xs ${tone.text}`}>{tone.label}</div>
                    </div>
                  </div>
                  {s.href && (
                    <Link href={s.href} className="shrink-0 text-sm font-semibold text-electric hover:underline">
                      Open
                    </Link>
                  )}
                </div>

                {s.findings.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-cardline pt-4">
                    {s.findings.map((f, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                            f.severity === "blocker" ? "bg-red-500" : "bg-amber-400"
                          }`}
                        />
                        <span className="text-slate">
                          {f.message}
                          {f.serviceSlug && (
                            <Link
                              href={`/dashboard/services`}
                              className="ml-1 font-medium text-electric hover:underline"
                            >
                              Open
                            </Link>
                          )}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ol>

        {r.notes.length > 0 && (
          <div className="mt-6 rounded-card bg-warmwhite p-4 text-xs text-slate">
            {r.notes.map((n, i) => <p key={i}>{n}</p>)}
          </div>
        )}
      </div>
    );
  });
}
