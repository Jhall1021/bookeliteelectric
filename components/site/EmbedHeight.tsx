"use client";

import { useEffect } from "react";

/**
 * Tell the parent how tall we are, so the frame stops being a scrolling box.
 *
 * The loader listens for exactly one message and nothing was sending it, so
 * every embed sat at its 640px minimum — short pages left dead whitespace and
 * long ones scrolled inside the frame, which is the giveaway that something is
 * embedded rather than part of the page.
 *
 * PRESENTATION ONLY, and deliberately one-way. This posts a number. It never
 * receives, so the parent has no channel into the storefront — a page that
 * could talk back would eventually be given something worth saying.
 *
 * Targeted at "*" because the frame cannot know which of the contractor's
 * origins loaded it, and the value is a height: it discloses nothing to a page
 * that already chose how tall to make us. Whether that page may frame us at
 * all was decided by frame-ancestors long before this ran.
 */
export default function EmbedHeight() {
  useEffect(() => {
    if (window.parent === window) return;

    let last = 0;
    const report = () => {
      const height = Math.ceil(document.documentElement.scrollHeight);
      // Only on a real change, and never on sub-pixel noise: a resize loop
      // between frame and parent is the classic way this goes wrong.
      if (Math.abs(height - last) < 2) return;
      last = height;
      window.parent.postMessage({ type: "p2b:height", height }, "*");
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    return () => observer.disconnect();
  }, []);

  return null;
}
