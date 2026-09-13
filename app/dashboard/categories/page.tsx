import Link from "next/link";
import ReorderList from "@/components/admin/ReorderList";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryName
} from "@/lib/categories";
import { withAdminContractor } from "@/lib/adminContext";

/**
 * Categories had no admin screen at all — sortOrder existed on the model and
 * was only ever set by the seed, so changing the order customers see meant a
 * database edit.
 */
export default async function AdminCategoriesPage() {
  // ADR-007: rooted at ContractorCategory. This screen edits contractor
  // presentation — ordering is exactly the thing that belongs to a contractor
  // rather than to the taxonomy — so the tenant-owned model is the root, and
  // the ids it emits are ContractorCategory ids that the reorder route
  // updates.
  // GUARD-ADOPTED (ADR-007a). The hand-written contractorId filter is gone.
  const categories = await withAdminContractor((db) =>
    db.contractorCategory.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        canonicalCategory: CANONICAL_CATEGORY_SELECT,
        _count: { select: { services: true } },
        services: { where: { active: true }, select: { id: true } },
      },
    })
  );

  const visibleServices = categories.reduce((sum, category) => sum + category.services.length, 0);
  const hiddenServices = categories.reduce((sum, category) => sum + category._count.services - category.services.length, 0);

  return (
    <div className="mx-auto w-full max-w-5xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Storefront</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-tight text-navy">Category order</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate">
            Arrange the groups people browse before they choose a service. Put your most important work near the top.
          </p>
        </div>
        <Link
          href="/dashboard/services"
          className="inline-flex items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric"
        >
          Open Services &amp; Pricing
        </Link>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Summary label="Categories" value={categories.length} />
        <Summary label="Visible services" value={visibleServices} tone="success" />
        <Summary label="Hidden services" value={hiddenServices} />
      </div>

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Browsing order</h2>
          <p className="mt-1 text-xs leading-relaxed text-slate">
            Use the arrow controls to move each category. This changes presentation only; service visibility stays where it is.
          </p>
        </div>

        <div className="p-4 sm:p-5">
          <ReorderList
            kind="categories"
            items={categories.map((cat) => {
              const hidden = cat._count.services - cat.services.length;
              return {
                id: cat.id,
                label: categoryName(cat),
                content: (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-semibold text-navy">{categoryName(cat)}</div>
                        {cat.services.length === 0 && (
                          <span className="rounded-pill bg-p2b-amber-tint px-2 py-0.5 text-[11px] font-semibold text-p2b-amber-ink">No visible services</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-slate">
                        {cat.services.length} visible {cat.services.length === 1 ? "service" : "services"}
                        {hidden > 0 && <span> · {hidden} hidden</span>}
                      </div>
                    </div>
                    <Link
                      href="/dashboard/services"
                      className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline px-3 py-2 text-xs font-semibold text-electric transition hover:border-electric hover:bg-electric/5"
                    >
                      Order services
                    </Link>
                  </div>
                ),
              };
            })}
          />
        </div>
      </section>
    </div>
  );
}

function Summary({ label, value, tone = "calm" }: { label: string; value: number; tone?: "calm" | "success" }) {
  return (
    <div className={`rounded-card border px-4 py-3 shadow-sm ${tone === "success" ? "border-success/25 bg-success/[0.04]" : "border-cardline bg-white"}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">{label}</p>
      <p className="mt-1 font-display text-xl font-bold tabular-nums text-navy">{value}</p>
    </div>
  );
}
