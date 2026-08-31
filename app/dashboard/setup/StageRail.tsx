"use client";

import { useRouter } from "next/navigation";

/** Moving between stages records the resume point, and nothing else. */
export default function StageRail({
  stages, current,
}: {
  stages: { key: string; title: string; status: string; blockers: number; locked: boolean }[];
  current: string;
}) {
  const router = useRouter();

  async function go(key: string, locked: boolean) {
    if (locked) return;
    await fetch("/api/admin/setup/progress", {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentStage: key }),
    });
    router.refresh();
  }

  const DOT: Record<string, string> = {
    blocked: "bg-red-500", warning: "bg-amber-400", ready: "bg-success", incomplete: "bg-slate/40",
  };

  return (
    <ol className="space-y-1">
      {stages.map((s, i) => (
        <li key={s.key}>
          <button
            type="button"
            onClick={() => go(s.key, s.locked)}
            disabled={s.locked}
            className={`flex w-full items-center gap-3 rounded-card px-3 py-2 text-left text-sm transition ${
              s.key === current ? "bg-electric/10 font-medium text-navy" : "text-slate hover:bg-warmwhite"
            } ${s.locked ? "cursor-default opacity-50" : ""}`}
          >
            <span className={`h-2 w-2 shrink-0 rounded-full ${DOT[s.status] ?? "bg-slate/40"}`} />
            <span className="text-slate">{i + 1}.</span>
            <span className="flex-1">{s.title}</span>
            {s.blockers > 0 && <span className="text-xs text-red-600">{s.blockers}</span>}
            {s.locked && <span className="text-xs text-slate">Soon</span>}
          </button>
        </li>
      ))}
    </ol>
  );
}
