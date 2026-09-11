"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { SearchInput } from "@/components/ui/SearchInput";
import { Badge } from "@/components/ui/Badge";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServiceStatusBadge } from "@/components/ui/ServiceStatusBadge";
import { Card, CardHeader } from "@/components/ui/Card";
import ReorderList from "@/components/admin/ReorderList";

export type ServiceRow = {
  id: string;
  slug: string;
  name: string;
  templateKey: string | null;
  active: boolean;
  offered: boolean;
  categoryId: string;
  bookingTypeLabel: string;
  fieldLaborHours: number | null;
  wwtLaborHours: number | null;
  hasWwtPrice: boolean;
  estimatedMinutes: number | null;
  estimatedMinutesReviewed: boolean;
  materialCount: number;
  materialCostCents: number | null;
  questionCount: number;
  pricing: { primary: string; secondary: string | null; needsAttention: boolean };
  status: { active: boolean; approved: boolean; priced: boolean; needsAttention: boolean };
};

export type CategoryGroup = { id: string; name: string; services: ServiceRow[] };

export type ReviewItem = {
  text: string;
  serviceId: string | null;
  severity: "blocker" | "warning";
};

type Filter = "all" | "offered" | "review";

export default function ServicesCatalogClient({
  categories,
  reviewItems,
  legacyMultiplierCount,
}: {
  categories: CategoryGroup[];
  reviewItems: ReviewItem[];
  legacyMultiplierCount: number;
}) {
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [filter, setFilter] = useState<Filter>("all");
  const [reordering, setReordering] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const allServices = useMemo(() => categories.flatMap((c) => c.services), [categories]);
  const counts = useMemo(
    () => ({
      all: allServices.length,
      offered: allServices.filter((s) => s.offered).length,
      review: allServices.filter((s) => s.status.needsAttention || s.pricing.needsAttention).length,
    }),
    [allServices]
  );

  const q = query.trim().toLowerCase();
  const matches = (s: ServiceRow) => {
    if (categoryId !== "all" && s.categoryId !== categoryId) return false;
    if (filter === "offered" && !s.offered) return false;
    if (filter === "review" && !(s.status.needsAttention || s.pricing.needsAttention)) return false;
    if (q && !s.name.toLowerCase().includes(q)) return false;
    return true;
  };

  const filteredCategories = categories
    .map((c) => ({ ...c, services: c.services.filter(matches) }))
    .filter((c) => c.services.length > 0);

  const blockerCount = reviewItems.filter((r) => r.severity === "blocker").length;
  const warningCount = reviewItems.length - blockerCount;

  return (
    <div>
      {/* Compact, actionable review summary — replaces a stat grid and a raw
          count of "unreviewed" fields with the same real findings the
          dashboard's readiness engine already computes, just for services. */}
      {reviewItems.length > 0 && (
        <Card className="mt-6" padding="sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {blockerCount > 0 && <Badge tone="blocker">{blockerCount} to resolve</Badge>}
              {warningCount > 0 && <Badge tone="attention">{warningCount} worth a look</Badge>}
              <span className="text-sm text-slate">before every service is fully ready to sell.</span>
            </div>
            <button
              type="button"
              onClick={() => setReviewOpen((v) => !v)}
              className="text-sm font-medium text-electric hover:underline"
            >
              {reviewOpen ? "Hide findings" : "Review findings"}
            </button>
          </div>
          {reviewOpen && (
            <ul className="mt-3 space-y-1.5 border-t border-cardline pt-3">
              {reviewItems.map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      item.severity === "blocker" ? "bg-red-500" : "bg-p2b-amber-ink"
                    }`}
                    aria-hidden="true"
                  />
                  {item.serviceId ? (
                    <Link href={`/dashboard/services/${item.serviceId}`} className="text-navy hover:underline">
                      {item.text}
                    </Link>
                  ) : (
                    <span className="text-navy">{item.text}</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {legacyMultiplierCount > 0 && (
        <p className="mt-3 rounded-card border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>{legacyMultiplierCount}</strong>{" "}
          {legacyMultiplierCount === 1 ? "service still carries" : "services still carry"} an imported
          material multiplier. Those are unvalidated workbook values, not deliberate overrides —
          they clear automatically once a service&rsquo;s materials are itemized.
        </p>
      )}

      <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="sm:w-64">
            <SearchInput value={query} onChange={setQuery} label="Search services" placeholder="Search services…" />
          </div>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-pill border border-cardline bg-white px-3 py-2 text-sm text-navy focus:border-electric focus:outline-none"
            aria-label="Filter by category"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <div className="flex items-center gap-1 rounded-pill border border-cardline bg-white p-1">
            <FilterPill active={filter === "all"} onClick={() => setFilter("all")}>
              All <span className="text-slate">{counts.all}</span>
            </FilterPill>
            <FilterPill active={filter === "offered"} onClick={() => setFilter("offered")}>
              Offered <span className="text-slate">{counts.offered}</span>
            </FilterPill>
            <FilterPill active={filter === "review"} onClick={() => setFilter("review")} tone="attention">
              Needs review <span className={filter === "review" ? "text-white/80" : "text-p2b-amber-ink"}>{counts.review}</span>
            </FilterPill>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReordering((v) => !v)}
          className="shrink-0 rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric sm:self-start"
        >
          {reordering ? "Done reordering" : "Reorder services"}
        </button>
      </div>

      {reordering && (
        <p className="mt-3 text-xs text-slate">
          Every category is shown, unfiltered, so you can see the real order customers see. Use the
          arrows to move a service within its category.
        </p>
      )}

      <div className="mt-4 space-y-8">
        {(reordering ? categories : filteredCategories).map((cat) => (
          <div key={cat.id}>
            <h2 className="font-display text-base font-bold text-navy">{cat.name}</h2>
            <div className="mt-2">
              {reordering ? (
                <ReorderList
                  kind="services"
                  items={cat.services.map((svc) => ({ id: svc.id, label: svc.name, content: <ServiceRowContent svc={svc} /> }))}
                />
              ) : (
                <div className="divide-y divide-cardline rounded-card border border-cardline bg-white">
                  {cat.services.map((svc) => (
                    <Link key={svc.id} href={`/dashboard/services/${svc.id}`} className="block p-3 hover:bg-warmwhite">
                      <ServiceRowContent svc={svc} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {!reordering && filteredCategories.length === 0 && (
          <p className="rounded-card border border-dashed border-cardline bg-warmwhite p-8 text-center text-sm text-slate">
            No services match {query ? `"${query}"` : "this filter"}.
          </p>
        )}
      </div>
    </div>
  );
}

function FilterPill({
  active, onClick, children, tone = "default",
}: { active: boolean; onClick: () => void; children: React.ReactNode; tone?: "default" | "attention" }) {
  const activeClass =
    tone === "attention" ? "bg-p2b-amber-ink text-white" : "bg-electric text-white";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-xs font-semibold transition ${
        active ? activeClass : "text-slate hover:text-navy"
      }`}
    >
      {children}
    </button>
  );
}

function ServiceRowContent({ svc }: { svc: ServiceRow }) {
  return (
    <div className={`flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4 ${!svc.active ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-3">
      <ServiceIcon templateKey={svc.templateKey} className="h-9 w-9 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-navy">{svc.name}</span>
          <ServiceStatusBadge {...svc.status} />
          {!svc.active && <span className="text-xs text-slate">(hidden)</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate">
          <span>{svc.bookingTypeLabel}</span>
          {svc.questionCount > 0 && <span>{svc.questionCount} question{svc.questionCount === 1 ? "" : "s"}</span>}
          <span className={svc.fieldLaborHours === null ? "text-amber-700" : ""}>
            {svc.fieldLaborHours !== null ? `${svc.fieldLaborHours} hr labor` : "labor not set"}
          </span>
          {svc.hasWwtPrice && (
            <span className={svc.wwtLaborHours === null ? "text-amber-700" : ""}>
              {svc.wwtLaborHours !== null ? `${svc.wwtLaborHours} hr add-on` : "add-on labor not set"}
            </span>
          )}
          {svc.materialCount > 0 ? (
            <span className="text-success">{svc.materialCount} materials</span>
          ) : svc.materialCostCents ? (
            <span className="text-amber-700">materials not itemized</span>
          ) : null}
        </div>
      </div>
      </div>
      <div className="shrink-0 pl-12 text-left sm:pl-0 sm:text-right">
        <div className={`text-sm font-medium ${svc.pricing.needsAttention ? "text-amber-700" : "text-navy"}`}>
          {svc.pricing.primary}
        </div>
        {svc.pricing.secondary && (
          <div className="text-xs text-amber-700">{svc.pricing.secondary}</div>
        )}
      </div>
    </div>
  );
}
