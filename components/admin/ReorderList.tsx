"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * `content` is a pre-rendered element rather than a render function.
 *
 * A Server Component can hand a Client Component elements, but not functions —
 * a callback can't be serialized across that boundary. Passing renderItem
 * compiled fine and then failed at request time, which is the worst place to
 * find out.
 */
type Item = { id: string; label: string; content?: React.ReactNode };

/**
 * Up/down reordering for a list of categories or services.
 *
 * Arrows rather than drag-and-drop: this is an admin screen used occasionally,
 * drag needs a library and doesn't work on touch without more work, and an
 * arrow can't drop something in the wrong place by accident.
 *
 * The list reorders locally on click and saves the whole array — see the
 * reorder route for why the whole array rather than one position.
 */
export default function ReorderList({
  kind,
  items,
}: {
  kind: "categories" | "services";
  items: Item[];
}) {
  const router = useRouter();
  const [order, setOrder] = useState(items);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
    setError(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/reorder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, ids: order.map((o) => o.id) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not save the order. Your unsaved order is still shown here."
        );
        return;
      }
      setDirty(false);
      router.refresh();
    } catch {
      setError(
        "Could not reach Price2Book. Your unsaved order is still shown here; try saving again when the connection returns."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="overflow-hidden rounded-card border border-cardline bg-white">
        {order.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 border-b border-cardline p-3.5 last:border-b-0 sm:p-4">
            <div className="flex shrink-0 flex-col overflow-hidden rounded-pill border border-cardline bg-warmwhite/70">
              <button
                type="button"
                onClick={() => move(i, -1)}
                disabled={i === 0 || saving}
                aria-label={`Move ${item.label} up`}
                className="flex h-8 w-9 items-center justify-center text-[10px] leading-none text-slate transition hover:bg-white hover:text-electric disabled:cursor-not-allowed disabled:opacity-25"
              >
                ▲
              </button>
              <div className="h-px bg-cardline" />
              <button
                type="button"
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1 || saving}
                aria-label={`Move ${item.label} down`}
                className="flex h-8 w-9 items-center justify-center text-[10px] leading-none text-slate transition hover:bg-white hover:text-electric disabled:cursor-not-allowed disabled:opacity-25"
              >
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {item.content ?? <span className="text-sm font-medium text-navy">{item.label}</span>}
            </div>
          </div>
        ))}
      </div>

      {error && <p role="alert" className="mt-3 rounded-card border border-red-100 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Only appears once something has moved — nothing to save otherwise,
          and a permanently-visible button invites pointless writes. */}
      {dirty && (
        <div className="mt-3 flex flex-col gap-2 rounded-card border border-electric/20 bg-electric/[0.04] p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-medium text-navy">You have unsaved ordering changes.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setOrder(items);
                setDirty(false);
                setError(null);
              }}
              disabled={saving}
              className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-slate transition hover:border-electric hover:text-navy disabled:opacity-50"
            >
              Undo
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save order"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
