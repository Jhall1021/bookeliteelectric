"use client";

import { useState } from "react";
import Link from "next/link";
import { ServiceIcon } from "@/components/ui/ServiceIcon";
import { ServiceStatusBadge } from "@/components/ui/ServiceStatusBadge";

type TabKey = "overview" | "pricing" | "materials" | "questions";

const TABS: { key: TabKey; label: string; hint: string }[] = [
  { key: "overview", label: "Overview", hint: "Service details" },
  { key: "pricing", label: "Pricing & labor", hint: "Price and time" },
  { key: "materials", label: "Materials", hint: "Parts and costs" },
  { key: "questions", label: "Customer questions", hint: "Booking flow" },
];

/**
 * The one consistent shell for a service's editor: a calm, scannable header
 * over four focused workspaces. Tab content arrives pre-rendered from the
 * server page, not as a render prop — Server Components can hand Client
 * Components elements but not functions.
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
  const activeTab = TABS.find((item) => item.key === tab) ?? TABS[0];

  return (
    <div className="mx-auto w-full max-w-6xl">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-slate">
        <Link href="/dashboard/services" className="font-medium transition hover:text-electric hover:underline">
          Services &amp; Pricing
        </Link>
        <span aria-hidden="true" className="text-cardline">/</span>
        <span className="truncate">{categoryName}</span>
      </nav>

      <section className="mt-3 rounded-card border border-cardline bg-white p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <div className="rounded-card bg-warmwhite p-2 ring-1 ring-cardline">
              <ServiceIcon templateKey={templateKey} className="h-10 w-10 shrink-0" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate">{categoryName}</p>
              <h1 className="mt-0.5 truncate font-display text-2xl font-bold tracking-tight text-navy sm:text-[28px]">
                {name}
              </h1>
              <div className="mt-1.5">
                <ServiceStatusBadge {...status} />
              </div>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/dashboard/services"
              className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-medium text-navy transition hover:border-electric"
            >
              Back to services
            </Link>
            <button
              type="button"
              onClick={() => setTab("questions")}
              className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover"
            >
              Review customer flow
            </button>
          </div>
        </div>
      </section>

      <div className="mt-4 rounded-card border border-cardline bg-white p-1.5 shadow-sm">
        <nav className="grid grid-cols-2 gap-1 sm:grid-cols-4" aria-label="Service editor sections">
          {TABS.map((item) => {
            const selected = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setTab(item.key)}
                aria-current={selected ? "page" : undefined}
                className={`rounded-[10px] px-3 py-2.5 text-left transition ${
                  selected
                    ? "bg-electric text-white shadow-sm"
                    : "text-navy hover:bg-warmwhite"
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span className={`mt-0.5 hidden text-[11px] sm:block ${selected ? "text-white/75" : "text-slate"}`}>
                  {item.hint}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <div className="mt-5">
        <div className="mb-3 flex items-center justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">Editing</p>
            <h2 className="mt-0.5 font-display text-lg font-bold text-navy">{activeTab.label}</h2>
          </div>
          <span className="hidden text-xs text-slate sm:block">{activeTab.hint}</span>
        </div>

        {TABS.map((item) => (
          <div key={item.key} hidden={tab !== item.key}>
            {content[item.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
