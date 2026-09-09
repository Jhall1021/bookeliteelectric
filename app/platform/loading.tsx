/**
 * Shown while the platform overview's per-contractor reads are in flight —
 * every route under app/platform is `force-dynamic` with no streaming
 * shell, so without this the browser showed nothing at all for however long
 * that took. Static markup only: no data, no query, nothing this file could
 * get wrong about a contractor.
 */
export default function PlatformLoading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <p className="text-sm text-slate">Loading the platform overview…</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="animate-pulse rounded-card border border-cardline bg-white p-5 shadow-card">
            <div className="h-3 w-20 rounded bg-warmwhite" />
            <div className="mt-3 h-6 w-14 rounded bg-warmwhite" />
          </div>
        ))}
      </div>
      <div className="mt-8 animate-pulse space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 rounded-card border border-cardline bg-white p-4 shadow-card" />
        ))}
      </div>
    </div>
  );
}
