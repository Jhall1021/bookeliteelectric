/** Same reasoning as app/platform/loading.tsx — this index runs the same per-contractor reads. */
export default function OnboardingIndexLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <div className="animate-pulse space-y-2">
        <div className="h-7 w-40 rounded bg-cardline" />
        <div className="h-4 w-full max-w-2xl rounded bg-cardline" />
        <div className="h-4 w-2/3 max-w-2xl rounded bg-cardline" />
      </div>
      <p className="mt-6 text-sm text-slate">Loading contractors and their setup progress…</p>
      <div className="mt-4 animate-pulse space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-card border border-cardline bg-white p-4 shadow-card" />
        ))}
      </div>
    </div>
  );
}
