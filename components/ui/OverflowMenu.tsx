"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A small "⋮" menu — replaces a row of repeated, always-visible red delete
 * buttons with one deliberate control per row. Closes on outside click,
 * Escape, or after an item is chosen.
 */
export function OverflowMenu({
  label, items,
}: {
  label: string;
  items: { label: string; onSelect: () => void; tone?: "default" | "danger" }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="rounded px-2 py-1 text-slate hover:bg-warmwhite hover:text-navy"
      >
        ⋮
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-card border border-cardline bg-white shadow-raised"
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={`block w-full px-3 py-2 text-left text-sm hover:bg-warmwhite ${
                item.tone === "danger" ? "text-red-600" : "text-navy"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
