import Link from "next/link";
import { prisma } from "@/lib/prisma";
import ReorderList from "@/components/admin/ReorderList";

/**
 * Categories had no admin screen at all — sortOrder existed on the model and
 * was only ever set by the seed, so changing the order customers see meant a
 * database edit.
 */
export default async function AdminCategoriesPage() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
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
          items={categories.map((c) => ({ id: c.id, label: c.name }))}
          renderItem={(item) => {
            const cat = categories.find((c) => c.id === item.id)!;
            const hidden = cat._count.services - cat.services.length;
            return (
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="truncate text-sm text-navy">{cat.name}</div>
                  <div className="mt-0.5 text-xs text-slate">
                    {cat.services.length}{" "}
                    {cat.services.length === 1 ? "service" : "services"}
                    {/* Worth surfacing: a category showing zero active
                        services still appears in the admin list but is empty
                        for customers. */}
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
            );
          }}
        />
      </div>
    </div>
  );
}
