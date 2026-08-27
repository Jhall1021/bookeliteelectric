import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ReorderList from "@/components/admin/ReorderList";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryName,
  soleContractorId,
} from "@/lib/categories";

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
  const contractorId = await soleContractorId(prisma, "the categories admin");
  const categories = await prisma.contractorCategory.findMany({
    where: { contractorId },
    orderBy: { sortOrder: "asc" },
    include: {
      canonicalCategory: CANONICAL_CATEGORY_SELECT,
      _count: { select: { services: true } },
      services: { where: { active: true }, select: { id: true } },
    },
  });

  return (
    <div>
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Categories</h1>
        <p className="mt-1 text-sm text-slate">
          The order here is the order customers see when browsing. Put the work you most
          want booked near the top.
        </p>
      </div>

      <div className="mt-6">
        <ReorderList
          kind="categories"
          items={categories.map((cat) => {
            const hidden = cat._count.services - cat.services.length;
            return {
              id: cat.id,
              label: categoryName(cat),
              // Rendered here rather than via a callback — a Server Component
              // can pass elements to a Client Component but not functions.
              content: (
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm text-navy">{categoryName(cat)}</div>
                    <div className="mt-0.5 text-xs text-slate">
                      {cat.services.length}{" "}
                      {cat.services.length === 1 ? "service" : "services"}
                      {hidden > 0 && <span> · {hidden} hidden</span>}
                      {cat.services.length === 0 && (
                        <span className="text-amber-700"> · nothing visible to customers</span>
                      )}
                    </div>
                  </div>
                  <Link
                    href="/admin/services"
                    className="shrink-0 text-xs font-medium text-electric"
                  >
                    Order services →
                  </Link>
                </div>
              ),
            };
          })}
        />
      </div>
    </div>
  );
}
