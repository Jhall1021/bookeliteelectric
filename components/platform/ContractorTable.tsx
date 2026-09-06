import Link from "next/link";
import type { PlatformOverview } from "@/lib/platformReadModel";

/**
 * The contractor directory table, shared by Overview and Contractors.
 * Presentational: every fact arrives already read through the platform
 * boundary; nothing here queries anything.
 */
export function ContractorTable({ rows }: { rows: PlatformOverview["rows"] }) {
  return (
    <div className="mt-3 overflow-x-auto rounded-card border border-cardline bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-warmwhite text-xs uppercase tracking-wide text-slate">
          <tr>
            <th className="px-4 py-2">Contractor</th>
            <th className="px-4 py-2">Enabled</th>
            <th className="px-4 py-2">Live services</th>
            <th className="px-4 py-2">Launch check</th>
            <th className="px-4 py-2">Storefront</th>
            <th className="px-4 py-2">Scheduling</th>
            <th className="px-4 py-2">Payments</th>
            <th className="px-4 py-2">Owners</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cardline">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2">
                <Link href={`/platform/contractors/${r.id}`} className="font-medium text-electric hover:underline">{r.name}</Link>
                <div className="text-xs text-slate">{r.slug} · {r.trade}</div>
              </td>
              <td className="px-4 py-2">{r.active ? "yes" : "no"}</td>
              <td className="px-4 py-2 tabular-nums">{r.readable ? r.live : <span className="text-red-700">unreadable</span>}</td>
              <td className="px-4 py-2">{r.readable ? (r.canLaunch ? "passes" : `${r.blockers} blocker${r.blockers === 1 ? "" : "s"}`) : <span className="text-red-700" title={r.error}>could not be read</span>}</td>
              <td className="px-4 py-2">{r.site ? `live · /${r.site.hostedSlug}${r.site.embedOriginsConfigured ? ` · ${r.site.embedOriginsConfigured} embed origin${r.site.embedOriginsConfigured === 1 ? "" : "s"}` : ""}` : "none live"}{r.retiredSites ? ` · ${r.retiredSites} retired` : ""}</td>
              <td className="px-4 py-2">{r.schedulingAuthority ? r.schedulingAuthority.toLowerCase() : "undecided"}</td>
              <td className="px-4 py-2">{r.payments.ready ? "ready" : r.payments.reason}</td>
              <td className="px-4 py-2 text-xs text-slate">{r.owners.join(", ") || "none"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
