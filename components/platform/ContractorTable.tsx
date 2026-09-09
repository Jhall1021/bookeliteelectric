import Link from "next/link";
import type { PlatformOverview } from "@/lib/platformReadModel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

/**
 * The contractor directory table, shared by Overview and Contractors.
 * Presentational: every fact arrives already read through the platform
 * boundary; nothing here queries anything.
 *
 * STATUS IS SHOWN NEUTRALLY. "In setup" is the ordinary state most
 * contractors are in most of the time — it earns a plain blue-gray badge,
 * the same visual weight as "Live". Amber/red is reserved for an actual
 * launch blocker, never for "hasn't finished yet".
 */
export function ContractorTable({ rows }: { rows: PlatformOverview["rows"] }) {
  return (
    <div className="overflow-x-auto rounded-card border border-cardline bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-warmwhite text-xs uppercase tracking-wide text-slate">
          <tr>
            <th className="px-4 py-2">Business</th>
            <th className="px-4 py-2">Setup</th>
            <th className="px-4 py-2">Next step</th>
            <th className="px-4 py-2">Live services</th>
            <th className="px-4 py-2">Storefront</th>
            <th className="px-4 py-2">Owners</th>
            <th className="px-4 py-2"><span className="sr-only">Action</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-cardline">
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="px-4 py-2.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
                    {(r.name.trim().match(/\S+/g) ?? []).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?"}
                  </span>
                  <div className="min-w-0">
                    <Link href={`/platform/contractors/${r.id}`} className="font-medium text-electric hover:underline">{r.name}</Link>
                    <div className="truncate text-xs text-slate">{r.slug} · {r.trade}</div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-2.5">
                {r.readable ? <SetupBadge live={r.live} canLaunch={r.canLaunch} blockers={r.blockers} /> : <Badge tone="blocker">unreadable</Badge>}
              </td>
              <td className="px-4 py-2.5 text-slate">
                {r.readable ? (r.nextStep ?? "—") : <span className="text-red-700" title={r.error}>could not be read</span>}
              </td>
              <td className="px-4 py-2.5 tabular-nums">{r.readable ? r.live : "—"}</td>
              <td className="px-4 py-2.5">{r.site ? `/${r.site.hostedSlug}` : "none live"}{r.retiredSites ? ` · ${r.retiredSites} retired` : ""}</td>
              <td className="px-4 py-2.5 text-xs text-slate">{r.owners.join(", ") || "none"}</td>
              <td className="px-4 py-2.5 text-right">
                <LinkButton href={r.owners.length === 0 ? `/platform/onboarding/${r.id}` : `/platform/contractors/${r.id}`} variant="secondary" size="sm">
                  {r.owners.length === 0 ? "Resume" : "View"}
                </LinkButton>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetupBadge({ live, canLaunch, blockers }: { live: number; canLaunch: boolean; blockers: number }) {
  if (live > 0) return <Badge tone="success">Live</Badge>;
  if (!canLaunch && blockers > 0) return <Badge tone="attention">{blockers} blocker{blockers === 1 ? "" : "s"}</Badge>;
  return <Badge tone="neutral">In setup</Badge>;
}
