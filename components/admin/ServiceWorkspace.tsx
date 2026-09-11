"use client";

import { useState } from "react";
import Link from "next/link";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServiceStatusBadge } from "@/components/ui/ServiceStatusBadge";

type TabKey = "overview" | "pricing" | "materials" | "questions";

const TABS: { key: TabKey; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "pricing", label: "Pricing & labor" },
  { key: "materials", label: "Materials" },
  { key: "questions", label: "Customer questions" },
];

/**
 * The one consistent shell for a service's editor: a header (icon, name,
 * status, a way to see the customer's side of it) over four tabs.
 *
 * Tab CONTENT arrives pre-rendered from the server page, not as a render
 * prop — a Server Component can hand a Client Component elements but not
 * functions, the same constraint components/admin/ReorderList.tsx's own
 * comment documents for exactly this reason.
 */
export default function ServiceWorkspace({
  categoryName, name, templateKey, status, initialTab = "overview", overview, pricing, materials, questions,
}: {
  categoryName: string;
  name: string;
  templateKey: string | null;
  status: { active: boolean; approved: boolean; priced: boolean; needsAttention: boolean };
  initialTab?: TabKey;
  overview: React.ReactNode;
  pricing: React.ReactNode;
  materials: React.ReactNode;
  questions: React.ReactNode;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);

  const content: Record<TabKey, React.ReactNode> = { overview, pricing, materials, questions };

  return (
    <div>
      <div className="text-sm text-slate">
        <Link href="/dashboard/services" className="hover:underline">Services &amp; Pricing</Link>
        <span className="mx-1.5">/</span>
        <span>{categoryName}</span>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ServiceIcon templateKey={templateKey} className="h-11 w-11 shrink-0" />
          <div>
            <h1 className="font-display text-2xl font-bold text-navy">{name}</h1>
            <div className="mt-0.5"><ServiceStatusBadge {...status} /></div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setTab("questions")}
          className="shrink-0 rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy hover:border-electric"
        >
          Test question flow
        </button>
      </div>

      <div className="mt-6 border-b border-cardline">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Service editor sections">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? "page" : undefined}
              className={`shrink-0 border-b-2 pb-3 text-sm font-medium transition ${
                tab === t.key
                  ? "border-electric text-electric"
                  : "border-transparent text-slate hover:text-navy"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {TABS.map((t) => (
          <div key={t.key} hidden={tab !== t.key}>
            {content[t.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
