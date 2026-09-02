"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

/**
 * A product screenshot that opens.
 *
 * The homepage shows six screens as thumbnails, three of them across a
 * twelve-column row, and a contractor cannot read a catalog row or a decision
 * tree at that size. They looked clickable and were not — the frame, the
 * shadow and the subject all promised a bigger version, and the click did
 * nothing. A picture that invites a click and refuses one is worse than a
 * picture that never invited it.
 *
 * The full-resolution PNG is already in the page's payload — next/image is
 * serving a downscaled variant of the same file — so opening it costs a
 * fetch of a larger variant and nothing else.
 *
 * DISCLOSURE RULES, same as the mobile menu: a real <button>, Escape closes
 * and returns focus, the backdrop closes, and the dialog is not in the DOM
 * while shut so nothing inside it is tabbable. `aria-modal` plus a label the
 * screen reader can use, because the alt text is the only description of what
 * opened.
 */
export default function ShotFigure({
  src,
  alt,
  width,
  height,
  className = "",
  sizes,
  priority,
  full,
  fullWidth,
  fullHeight,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  sizes?: string;
  priority?: boolean;
  /** The uncropped page. Falls back to the thumbnail when absent. */
  full?: string;
  fullWidth?: number;
  fullHeight?: number;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // The page behind a modal must not scroll under it.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Expand screenshot: ${alt}`}
        className={`group block w-full cursor-zoom-in overflow-hidden rounded-[4px] border border-p2b-line bg-white text-left shadow-[0_1px_2px_rgba(16,24,40,.04),0_10px_24px_-12px_rgba(16,24,40,.14)] transition hover:shadow-[0_2px_6px_rgba(16,24,40,.08),0_16px_36px_-14px_rgba(16,24,40,.22)] ${className}`}
      >
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          sizes={sizes}
          priority={priority}
          className="h-auto w-full"
        />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          onClick={() => {
            setOpen(false);
            triggerRef.current?.focus();
          }}
          className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-[rgba(12,16,24,.82)] p-4 lg:p-10"
        >
          <div className="flex max-h-full w-full max-w-[1500px] flex-col">
            <div className="mb-3 flex items-start justify-between gap-4">
              <p className="max-w-[80ch] text-[13px] leading-[1.45] text-[#D8DEE9] lg:text-sm">{alt}</p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="-mt-1 shrink-0 rounded-sm px-3 py-1.5 text-[14px] font-semibold text-[#D8DEE9] hover:text-white"
              >
                Close <span aria-hidden="true">✕</span>
              </button>
            </div>
            {/* Stop propagation so clicking the image itself does not close
                the thing the reader just opened to look at. */}
            {/* w-full and a max-width on the image: without both, the scroll
                container sizes to the intrinsic 2080px and the first thing a
                reader sees is a screenshot cropped at the right edge. */}
            <div className="min-h-0 w-full overflow-auto rounded-[4px] bg-white"
                 onClick={(e) => e.stopPropagation()}>
              {/* The WHOLE page, not the crop. Opening a thumbnail to be shown
                  the same crop larger is the wrong way round — the click means
                  "show me more of this", and a tall page scrolls inside the
                  dialog rather than being trimmed to fit it. */}
              <Image
                src={full ?? src}
                alt=""
                width={fullWidth ?? width}
                height={fullHeight ?? height}
                sizes="100vw"
                className="h-auto w-full max-w-full cursor-default"
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
