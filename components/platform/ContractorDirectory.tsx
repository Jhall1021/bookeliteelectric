"use client";

import { useMemo, useState } from "react";
import type { PlatformOverview } from "@/lib/platformReadModel";
import { SearchInput } from "@/components/ui/SearchInput";
import { ContractorTable } from "@/components/platform/ContractorTable";

/**
 * Client-side filter over rows the server already read — no new query, no
 * new guarded-client surface. Fine at the scale this directory actually is
 * (platformOverview reads a handful to a few dozen contractors at once,
 * per OVERVIEW_CONCURRENCY's own comment); a search box that round-tripped
 * to the server for this would be solving a problem the data doesn't have.
 */
export function ContractorDirectory({ rows }: { rows: PlatformOverview["rows"] }) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q) ||
      r.trade.toLowerCase().includes(q) ||
      r.owners.some((o) => o.toLowerCase().includes(q))
    );
  }, [rows, query]);

  return (
    <div>
      <div className="max-w-sm">
        <SearchInput value={query} onChange={setQuery} label="Search contractors" placeholder="Search by name, slug, trade, or owner…" />
      </div>
      <p className="mt-2 text-xs text-slate">
        {filtered.length} of {rows.length} contractor{rows.length === 1 ? "" : "s"}
      </p>
      <div className="mt-3">
        {filtered.length > 0 ? (
          <ContractorTable rows={filtered} />
        ) : (
          <p className="rounded-card border border-cardline bg-white p-6 text-center text-sm text-slate">
            No contractor matches &ldquo;{query}&rdquo;.
          </p>
        )}
      </div>
    </div>
  );
}
