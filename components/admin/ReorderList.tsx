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
    const res = await fetch("/api/admin/reorder", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, ids: order.map((o) => o.id) }),
    });
    setSaving(false);
    if (res.ok) {
      setDirty(false);
      router.refresh();
    } else {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const d = await res.json();
        if (d?.error) detail = d.error;
      } catch {}
      setError(detail);
    }
  }

  return (
    <div>
      <div className="divide-y divide-cardline rounded-card border border-cardline bg-white">
        {order.map((item, i) => (
          <div key={item.id} className="flex items-center gap-3 p-3">
            <div className="flex shrink-0 flex-col">
              <button
                onClick={() => move(i, -1)}
                disabled={i === 0}
                aria-label={`Move ${item.label} up`}
                className="px-1 text-xs leading-none text-slate hover:text-electric disabled:opacity-20"
              >
                ▲
              </button>
              <button
                onClick={() => move(i, 1)}
                disabled={i === order.length - 1}
                aria-label={`Move ${item.label} down`}
                className="px-1 text-xs leading-none text-slate hover:text-electric disabled:opacity-20"
              >
                ▼
              </button>
            </div>
            <div className="min-w-0 flex-1">
              {item.content ?? <span className="text-sm text-navy">{item.label}</span>}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Only appears once something has moved — nothing to save otherwise,
          and a permanently-visible button invites pointless writes. */}
      {dirty && (
        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={save}
            disabled={saving}
            className="rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save this order"}
          </button>
          <button
            onClick={() => {
              setOrder(items);
              setDirty(false);
            }}
            className="text-sm text-slate hover:text-navy"
          >
            Undo
          </button>
        </div>
      )}
    </div>
  );
}
