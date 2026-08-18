import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";

export default async function AdminServicesPage() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        orderBy: { name: "asc" },
        select: {
          id: true, name: true, basePrice: true, whileWeThereBasePrice: true,
          startingPriceLabel: true, bookingType: true, active: true,
        },
      },
    },
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Services &amp; Pricing</h1>
          <p className="mt-1 text-sm text-slate">
            Click any service to edit its price, description, or availability. Changes apply
            immediately — no reseed or redeploy needed.
          </p>
        </div>
        <Link
          href="/admin/services/new"
          className="shrink-0 rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover"
        >
          + New Service
        </Link>
      </div>

      <div className="mt-6 space-y-8">
        {categories.map((cat) => (
          <div key={cat.id}>
            <h2 className="font-display text-base font-bold text-navy">{cat.name}</h2>
            <div className="mt-2 divide-y divide-cardline rounded-card border border-cardline bg-white">
              {cat.services.map((svc) => (
                <Link
                  key={svc.id}
                  href={`/admin/services/${svc.id}`}
                  className={`flex items-center justify-between p-3 text-sm hover:bg-warmwhite ${
                    !svc.active ? "opacity-50" : ""
                  }`}
                >
                  <div>
                    <span className="text-navy">{svc.name}</span>
                    {!svc.active && <span className="ml-2 text-xs text-slate">(hidden from browsing)</span>}
                  </div>
                  <div className="flex items-center gap-3 text-slate">
                    <span className="text-xs">{svc.bookingType.replace("_", " ")}</span>
                    <span className="font-medium text-navy">
                      {svc.basePrice ? formatCents(svc.basePrice) : svc.startingPriceLabel ?? "Custom Quote"}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
