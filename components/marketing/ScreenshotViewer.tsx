"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import type { Shot } from "./ControlPanel";

/**
 * The control-panel tiles, enlargeable — ADR-020.
 *
 * A quarter-width tile in a 1440px grid renders a 1040px screenshot at about a
 * quarter scale, which is enough to show that a real screen exists and not
 * enough to read one. The tiles stay as they are and open on click, so the
 * section still scans as a grid of modules rather than becoming a gallery.
 *
 * Escape closes, the backdrop closes, focus returns to the tile that opened
 * it, and background scrolling is locked while it is open — a lightbox that
 * traps a keyboard user is worse than no lightbox.
 */
export default function ScreenshotViewer({
  modules,
  shots,
}: {
  modules: readonly string[];
  shots: Record<string, Shot>;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const shot = open ? shots[open] : null;

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  return (
    <>
      <div className="mt-9 grid gap-4 sm:grid-cols-2 lg:mt-11 lg:grid-cols-4 lg:gap-[18px]">
        {modules.map((m) => {
          const s = shots[m] ?? null;
          return (
            <div key={m} className="rounded-[3px] border border-p2b-line bg-white p-5">
              <div className="text-base font-semibold">{m}</div>
              {s ? (
                <button
                  type="button"
                  onClick={() => setOpen(m)}
                  aria-label={`Enlarge the ${m} screen`}
                  className="group mt-4 block w-full overflow-hidden rounded-sm border border-p2b-line focus:outline-none focus:ring-2 focus:ring-p2b-accent"
                >
                  <Image
                    src={s.src} alt={s.alt} width={s.w} height={s.h}
                    sizes="(min-width: 1024px) 300px, (min-width: 640px) 45vw, 90vw"
                    className="h-40 w-full object-cover object-top transition group-hover:opacity-90 lg:h-[150px]"
                  />
                  <span className="block bg-p2b-surface-warm py-1.5 text-[12px] font-medium text-p2b-muted group-hover:text-p2b-accent">
                    Click to enlarge
                  </span>
                </button>
              ) : (
                <div className="mt-4 flex h-40 items-center justify-center rounded-sm border border-dashed border-p2b-line-dash text-[13px] text-p2b-faint lg:h-[150px]">
                  Coming soon
                </div>
              )}
            </div>
          );
        })}
      </div>

      {open && shot && (
        <div
          role="dialog" aria-modal="true" aria-label={`${open} — enlarged`}
          onClick={close}
          className="fixed inset-0 z-50 flex items-center justify-center bg-p2b-ink/80 p-4 lg:p-10"
        >
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-6xl">
            <div className="flex items-center justify-between gap-4 pb-3 text-p2b-canvas">
              <span className="text-[15px] font-semibold">{open}</span>
              <button onClick={close} autoFocus
                      className="rounded-sm border border-p2b-canvas/40 px-3 py-1 text-[13px] font-medium hover:bg-white/10">
                Close
              </button>
            </div>
            <Image
              src={shot.src} alt={shot.alt} width={shot.w} height={shot.h}
              sizes="(min-width: 1024px) 1152px, 100vw"
              className="w-full rounded-[3px] border border-p2b-line bg-white"
            />
            <p className="pt-3 text-[13px] text-p2b-canvas/70">
              Shown with a demonstration contractor.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
