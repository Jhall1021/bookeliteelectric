import Link from "next/link";
import { platformOnboardingIndex, noticeText, SLUG_INPUT_PATTERN, SLUG_MAX } from "@/lib/platformOnboarding";
import { hasPlatformCapability } from "@/lib/platformCapabilities";
import { HiddenFixturesNote } from "@/components/platform/HiddenFixturesNote";
import { SubmitButton } from "@/components/platform/SubmitButton";
import { startContractorAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PlatformOnboardingIndex({ searchParams }: { searchParams?: { notice?: string } }) {
  const { rows, trades, actor, hiddenFixtures } = await platformOnboardingIndex();
  const notice = noticeText(searchParams?.notice);
  const canOnboard = hasPlatformCapability(actor.role, "CONTRACTOR_ONBOARD");
  const open = rows.filter((r) => !r.readable || (r.progress !== "launched" && r.progress !== "retired"));
  const launched = rows.filter((r) => r.readable && r.progress === "launched");
  const retired = rows.filter((r) => r.readable && r.progress === "retired");

  return (
    <div className="mx-auto w-full max-w-6xl">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Platform admin</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Onboarding</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate">
            {canOnboard
              ? "Start a contractor, hand off each real setup decision to the authority that owns it, and resume the process without creating a parallel onboarding system."
              : "Review contractor onboarding progress and blockers. Your staff access is read-only for onboarding changes."}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[250px]">
          <Summary label="In progress" value={open.length} />
          <Summary label="Launched" value={launched.length} tone="success" />
        </div>
      </header>

      <div className="mt-5"><HiddenFixturesNote hidden={hiddenFixtures} /></div>

      {notice && (
        <p className={`mt-4 rounded-card border px-4 py-3 text-sm ${notice.tone === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-p2b-amber-ink/40 bg-p2b-amber-tint text-p2b-amber-ink"}`}>
          {notice.text}
        </p>
      )}

      {canOnboard ? (
        <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
          <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold text-navy">Start a contractor</h2>
                <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate">
                  Creates the contractor, storefront address, and guided-setup record only. It does not assign an owner, install a trade catalog, publish services, or make anything customer-facing.
                </p>
              </div>
              <span className="rounded-pill border border-cardline bg-white px-3 py-1 text-[11px] font-semibold text-slate">
                {trades.length} published trade{trades.length === 1 ? "" : "s"}
              </span>
            </div>
          </div>

          <form action={startContractorAction} className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Business name</span>
              <input
                name="name"
                required
                maxLength={120}
                className="mt-2 w-full rounded-card border border-cardline px-4 py-2.5 text-sm text-navy outline-none focus:border-electric focus:ring-2 focus:ring-electric/10"
                placeholder="Northside Electric"
              />
            </label>
            <label className="text-sm">
              <span className="block text-xs font-semibold uppercase tracking-wide text-slate">Web address <span className="font-normal normal-case tracking-normal">(optional)</span></span>
              <input
                name="slug"
                maxLength={SLUG_MAX}
                pattern={SLUG_INPUT_PATTERN}
                title="lowercase letters and numbers joined by single hyphens, 3 to 48 characters; some words are reserved"
                className="mt-2 w-full rounded-card border border-cardline px-4 py-2.5 text-sm text-navy outline-none focus:border-electric focus:ring-2 focus:ring-electric/10"
                placeholder="northside-electric"
              />
            </label>
            <div className="sm:col-span-2 lg:col-span-1">
              <SubmitButton pendingLabel="Creating…">Create contractor</SubmitButton>
            </div>
          </form>

          <div className="border-t border-cardline bg-warmwhite/40 px-5 py-3 text-xs text-slate sm:px-6">
            Published catalogs: {trades.join(", ") || "none"}. If the web address is already in use, onboarding resumes that contractor instead of creating a duplicate.
          </div>
        </section>
      ) : (
        <section className="mt-6 rounded-card border border-cardline bg-warmwhite/60 px-5 py-4 text-sm text-slate sm:px-6">
          <p className="font-semibold text-navy">Read-only onboarding access</p>
          <p className="mt-1 leading-relaxed">You can review progress, launch blockers, and contractor setup state, but this role cannot create contractors or change onboarding data.</p>
        </section>
      )}

      <OnboardingSection
        title="In onboarding"
        description="Contractors that still have setup work to complete or cannot currently be read."
        rows={open}
        empty="Every contractor has completed onboarding."
      />

      <OnboardingSection
        title="Launched"
        description="Contractors with at least one live service after the shared launch guards passed."
        rows={launched}
        empty="No contractors have launched yet."
      />

      {retired.length > 0 && (
        <OnboardingSection
          title="Retired"
          description="Storefront and services inactive; contractor data is retained."
          rows={retired}
          empty=""
        />
      )}

      <div className="mt-8 rounded-card border border-cardline bg-warmwhite/60 px-4 py-3 text-xs leading-relaxed text-slate">
        Signed in as {actor.email}, {actor.role}. {canOnboard ? "Onboarding changes" : "Reads"} still go through the reviewed platform authority boundary.
      </div>
    </div>
  );
}

function OnboardingSection({
  title, description, rows, empty,
}: {
  title: string;
  description: string;
  rows: Awaited<ReturnType<typeof platformOnboardingIndex>>["rows"];
  empty: string;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3">
        <h2 className="font-display text-lg font-bold text-navy">{title}</h2>
        <p className="mt-0.5 text-xs text-slate">{description}</p>
      </div>
      {rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-cardline bg-white px-5 py-8 text-center text-sm text-slate">{empty}</div>
      ) : (
        <Rows rows={rows} />
      )}
    </section>
  );
}

function Rows({ rows }: { rows: Awaited<ReturnType<typeof platformOnboardingIndex>>["rows"] }) {
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="rounded-card border border-cardline bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <Link href={`/platform/onboarding/${r.id}`} className="break-words font-semibold text-navy hover:text-electric hover:underline">
                  {r.name}
                </Link>
                {r.readable ? (
                  <ProgressPill progress={r.progress} />
                ) : (
                  <span className="rounded-pill bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700" title={r.error}>could not be read</span>
                )}
              </div>
              <p className="mt-1 break-words text-xs text-slate">/{r.slug} · owners: {r.owners.join(", ") || "none"}</p>
              {r.readable && (
                <p className="mt-2 text-xs text-slate">{r.live} live service{r.live === 1 ? "" : "s"} · {r.blockers} blocker{r.blockers === 1 ? "" : "s"}</p>
              )}
            </div>
            <Link href={`/platform/onboarding/${r.id}`} className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-electric transition hover:border-electric hover:bg-electric/5">
              {r.readable && (r.progress === "launched" || r.progress === "retired") ? "Open" : "Resume"}
            </Link>
          </div>
        </li>
      ))}
    </ul>
  );
}

function ProgressPill({ progress }: { progress: "not-started" | "in-progress" | "blocked" | "ready" | "launched" | "retired" }) {
  const tone = progress === "launched"
    ? "bg-success/10 text-success"
    : progress === "ready"
      ? "bg-electric/10 text-electric"
      : progress === "blocked"
        ? "bg-p2b-amber-tint text-p2b-amber-ink"
        : progress === "retired"
          ? "bg-navy text-white"
          : "bg-warmwhite text-slate";
  return <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${tone}`}>{progress.replace("-", " ")}</span>;
}

function Summary({ label, value, tone = "calm" }: { label: string; value: number; tone?: "calm" | "success" }) {
  return (
    <div className={`rounded-card border px-3 py-2.5 text-center shadow-sm ${tone === "success" ? "border-success/25 bg-success/[0.04]" : "border-cardline bg-white"}`}>
      <div className="font-display text-xl font-bold tabular-nums text-navy">{value}</div>
      <div className="mt-0.5 text-[11px] font-medium text-slate">{label}</div>
    </div>
  );
}
