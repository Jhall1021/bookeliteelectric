import Link from "next/link";
import type { PlatformOverview } from "@/lib/platformReadModel";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";

/**
 * The contractor directory, shared by Overview and Contractors.
 * Presentational: every fact arrives already read through the platform
 * boundary; nothing here queries anything.
 *
 * TWO LAYOUTS, ONE DATA SET. A table's own columns are what wrap awkwardly
 * on a narrow screen — not because the DATA changes, but because a row of
 * seven cells has nowhere to go. Below `lg`, the same rows render as
 * compact stacked records instead (name, status, next step and the action
 * always visible; storefront/owners tucked behind a `<details>`) rather
 * than a table trying to survive at 360px.
 *
 * STATUS IS SHOWN NEUTRALLY. "In setup" is the ordinary state most
 * contractors are in most of the time — it earns a plain blue-gray badge,
 * the same visual weight as "Live". Amber/red is reserved for an actual
 * launch blocker, never for "hasn't finished yet".
 */
export function ContractorTable({ rows }: { rows: PlatformOverview["rows"] }) {
  return (
    <>
      <div className="hidden overflow-x-auto rounded-card border border-cardline bg-white lg:block">
        <table className="w-full text-left text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[11%]" />
            <col className="w-[20%]" />
            <col className="w-[10%]" />
            <col className="w-[16%]" />
            <col className="w-[11%]" />
            <col className="w-[6%]" />
          </colgroup>
          <thead className="bg-warmwhite text-xs uppercase tracking-wide text-slate">
            <tr>
              <th className="px-4 py-2">Business</th>
              <th className="px-4 py-2">Setup</th>
              <th className="px-4 py-2">Next step</th>
              <th className="px-4 py-2">Services</th>
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
                    <Avatar name={r.name} />
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
                <td className="px-4 py-2.5 truncate">{r.site ? `/${r.site.hostedSlug}` : "none live"}{r.retiredSites ? ` · ${r.retiredSites} retired` : ""}</td>
                <td className="px-4 py-2.5 truncate text-xs text-slate">{r.owners.join(", ") || "none"}</td>
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

      <ul className="divide-y divide-cardline rounded-card border border-cardline bg-white lg:hidden">
        {rows.map((r) => (
          <li key={r.id} className="p-3">
            <div className="flex items-center gap-3">
              <Avatar name={r.name} />
              <div className="min-w-0 flex-1">
                <Link href={`/platform/contractors/${r.id}`} className="font-medium text-electric hover:underline">{r.name}</Link>
                <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                  {r.readable ? <SetupBadge live={r.live} canLaunch={r.canLaunch} blockers={r.blockers} /> : <Badge tone="blocker">unreadable</Badge>}
                  {r.readable && r.nextStep && <span className="text-xs text-slate">{r.nextStep}</span>}
                </div>
              </div>
              <LinkButton href={r.owners.length === 0 ? `/platform/onboarding/${r.id}` : `/platform/contractors/${r.id}`} variant="secondary" size="sm" className="shrink-0">
                {r.owners.length === 0 ? "Resume" : "View"}
              </LinkButton>
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs font-medium text-slate">Details</summary>
              <dl className="mt-1.5 space-y-1 text-xs text-slate">
                <div className="flex justify-between"><dt>Trade</dt><dd>{r.slug} · {r.trade}</dd></div>
                <div className="flex justify-between"><dt>Live services</dt><dd>{r.readable ? r.live : "—"}</dd></div>
                <div className="flex justify-between"><dt>Storefront</dt><dd className="truncate">{r.site ? `/${r.site.hostedSlug}` : "none live"}{r.retiredSites ? ` · ${r.retiredSites} retired` : ""}</dd></div>
                <div className="flex justify-between"><dt>Owners</dt><dd className="truncate">{r.owners.join(", ") || "none"}</dd></div>
              </dl>
            </details>
          </li>
        ))}
      </ul>
    </>
  );
}

function Avatar({ name }: { name: string }) {
  const initials = (name.trim().match(/\S+/g) ?? []).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-electric/10 text-xs font-bold text-electric">
      {initials}
    </span>
  );
}

function SetupBadge({ live, canLaunch, blockers }: { live: number; canLaunch: boolean; blockers: number }) {
  if (live > 0) return <Badge tone="success">Live</Badge>;
  if (!canLaunch && blockers > 0) return <Badge tone="attention">{blockers} blocker{blockers === 1 ? "" : "s"}</Badge>;
  return <Badge tone="neutral">In setup</Badge>;
}
