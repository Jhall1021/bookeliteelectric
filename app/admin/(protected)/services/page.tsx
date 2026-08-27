import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { formatCents } from "@/lib/flow-types";
import ReorderList from "@/components/admin/ReorderList";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryName,
  soleContractorId,
} from "@/lib/categories";

export default async function AdminServicesPage() {
  // ADR-007: rooted at ContractorCategory, the tenant-owned model.
  const contractorId = await soleContractorId(prisma, "the services admin");
  const categories = await prisma.contractorCategory.findMany({
    where: { contractorId },
    orderBy: { sortOrder: "asc" },
    include: {
      canonicalCategory: CANONICAL_CATEGORY_SELECT,
      services: {
        // Was ordered by name, which put "200-Amp Service Upgrade" at the top
        // of Panel Upgrades regardless of how rarely anyone books one. Name is
        // the tiebreak now, so services added before ordering existed still
        // sit somewhere predictable.
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          basePrice: true,
          whileWeThereBasePrice: true,
          startingPriceLabel: true,
          bookingType: true,
          active: true,
          fieldLaborHours: true,
          wwtLaborHours: true,
          estimatedMinutes: true,
          estimatedMinutesReviewed: true,
          materialCostCents: true,
          materialMultiplier: true,
          _count: { select: { questions: true, materials: true } },
        },
      },
    },
  });

  const all = categories.flatMap((c) => c.services);
  const withLabor = all.filter((s) => s.fieldLaborHours !== null).length;
  const itemized = all.filter((s) => s._count.materials > 0).length;
  const legacyMultiplier = all.filter((s) => s.materialMultiplier !== null).length;
  // Services selling an add-on with no incremental hours recorded. The price
  // came from the original import; the labor behind it never existed.
  const wwtWithoutLabor = all.filter(
    (s) => s.whileWeThereBasePrice !== null && s.wwtLaborHours === null
  ).length;
  const unreviewedDuration = all.filter((s) => !s.estimatedMinutesReviewed).length;

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-navy">Services &amp; Pricing</h1>
          <p className="mt-1 text-sm text-slate">
            Click any service to edit its price, labor and materials. Changes apply
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

      {/* What's established and what isn't, across the whole catalog. Clicking
          into 70 services one at a time to find the gaps is how they stay
          unfilled. */}
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Services" value={`${all.length}`} />
        <Stat
          label="Labor hours set"
          value={`${withLabor} of ${all.length}`}
          warn={withLabor < all.length}
        />
        <Stat
          label="Materials itemized"
          value={`${itemized} of ${all.length}`}
          warn={itemized < all.length}
        />
        <Stat
          label="Add-on labor missing"
          value={`${wwtWithoutLabor}`}
          warn={wwtWithoutLabor > 0}
        />
        <Stat
          label="Duration unreviewed"
          value={`${unreviewedDuration}`}
          warn={unreviewedDuration > 0}
        />
      </div>

      {legacyMultiplier > 0 && (
        <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>{legacyMultiplier}</strong>{" "}
          {legacyMultiplier === 1 ? "service still carries" : "services still carry"} an imported
          material multiplier. Those are unvalidated workbook values, not deliberate overrides —
          they clear automatically when a service&rsquo;s materials are itemized.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate">
          Use the arrows to set the order customers see. Categories are ordered on the{" "}
          <Link href="/admin/categories" className="text-electric">
            Categories
          </Link>{" "}
          page.
        </p>
      </div>

      <div className="mt-4 space-y-8">
        {categories.map((cat) => (
          <div key={cat.id}>
            <h2 className="font-display text-base font-bold text-navy">{categoryName(cat)}</h2>
            <div className="mt-2">
              <ReorderList
                kind="services"
                items={cat.services.map((svc) => ({
                  id: svc.id,
                  label: svc.name,
                  // Elements, not a callback — functions can't cross from a
                  // Server Component into a Client one.
                  content: (
                    <Link
                      href={`/admin/services/${svc.id}`}
                      className={`flex items-center justify-between gap-4 ${
                        !svc.active ? "opacity-50" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm text-navy">
                          {svc.name}
                          {!svc.active && <span className="ml-2 text-xs text-slate">(hidden)</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
                          <span>{svc.bookingType.replace(/_/g, " ").toLowerCase()}</span>
                          {svc._count.questions > 0 && <span>{svc._count.questions} questions</span>}
                          <span className={svc.fieldLaborHours === null ? "text-amber-700" : ""}>
                            {svc.fieldLaborHours !== null
                              ? `${svc.fieldLaborHours} hr`
                              : "labor not set"}
                          </span>
                          {/* Shown even when missing. An add-on price with no
                              hours behind it can't produce a suggestion, and
                              a field that only appears when filled is a gap
                              nobody finds. */}
                          {svc.wwtLaborHours !== null ? (
                            <span>{svc.wwtLaborHours} hr add-on</span>
                          ) : svc.whileWeThereBasePrice !== null ? (
                            <span className="text-amber-700">add-on labor not set</span>
                          ) : null}
                          {svc.estimatedMinutes !== null && (
                            <span className={!svc.estimatedMinutesReviewed ? "text-amber-700" : ""}>
                              {svc.estimatedMinutes} min
                              {!svc.estimatedMinutesReviewed && " unreviewed"}
                            </span>
                          )}
                          {svc._count.materials > 0 ? (
                            <span className="text-success">{svc._count.materials} materials</span>
                          ) : svc.materialCostCents ? (
                            <span className="text-amber-700">
                              {formatCents(svc.materialCostCents)} not itemized
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-sm font-medium text-navy">
                          {svc.basePrice
                            ? formatCents(svc.basePrice)
                            : svc.startingPriceLabel ?? "Custom Quote"}
                        </div>
                        {svc.whileWeThereBasePrice !== null && (
                          <div className="text-xs text-slate">
                            {formatCents(svc.whileWeThereBasePrice)} add-on
                          </div>
                        )}
                      </div>
                    </Link>
                  ),
                }))}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className="rounded-card border border-cardline bg-white p-3">
      <div className="text-xs text-slate">{label}</div>
      <div
        className={`mt-0.5 font-display text-lg font-bold ${
          warn ? "text-amber-700" : "text-navy"
        }`}
      >
        {value}
      </div>
    </div>
  );
}
