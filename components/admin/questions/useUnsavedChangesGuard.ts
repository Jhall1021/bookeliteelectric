"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Confirms before an unsaved question-tree edit is abandoned — by an
 * internal link click OR the browser's own back/forward button, not just a
 * full page unload. Scoped to this one editor; nothing here is shared
 * elsewhere, and nothing elsewhere needs it (no other admin panel here
 * accumulates a multi-field draft the way this one does — the others
 * either auto-save per field or have nothing to lose).
 *
 * THREE DIFFERENT THINGS, THREE DIFFERENT MECHANISMS
 *
 *   full unload (reload, close tab, typed URL)
 *     `beforeunload` — the browser's own native prompt. This is the one
 *     case a page's own JS cannot show a custom UI for; the native prompt
 *     is all any site gets.
 *
 *   an internal <a> click (sidebar nav, breadcrumb, another catalog row)
 *     Intercepted on `document` at the CAPTURE phase — before next/link's
 *     own click handler ever runs, so `preventDefault()` here means the
 *     router is never invoked at all. "Discard" then completes the SAME
 *     navigation via `router.push`.
 *
 *   the browser's back/forward button
 *     `popstate` cannot be canceled — by the time it fires, the address
 *     bar already shows the new URL. The trick: the instant edits become
 *     dirty, push one extra history entry for the CURRENT url. The next
 *     back-press just returns to that duplicate — same URL, so Next's own
 *     router treats it as no navigation and nothing unmounts — which is
 *     exactly when this shows the prompt. Every further back-press while
 *     still dirty re-plants the same duplicate (pushState from a
 *     mid-stack position always overwrites the forward stack, so this
 *     never actually grows past one extra entry no matter how many times
 *     it cycles). "Discard" jumps back exactly two real steps — one for
 *     the duplicate, one for the step the contractor actually meant —
 *     with a bypass flag so that jump's own popstate isn't re-trapped.
 */
export type PendingNavigation = { kind: "link"; href: string } | { kind: "history" };

export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [pending, setPending] = useState<PendingNavigation | null>(null);
  const historyArmedRef = useRef(false);
  const bypassNextPopStateRef = useRef(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!dirtyRef.current || e.defaultPrevented) return;
      // A modified click (open in new tab, etc.) isn't "leaving this page".
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return; // external links proceed normally
      if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page
      e.preventDefault();
      e.stopPropagation();
      setPending({ kind: "link", href: `${url.pathname}${url.search}${url.hash}` });
    }
    // Capture phase: runs before next/link's own bubble-phase handler, so
    // preventDefault here stops the router from ever being invoked.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (dirty && !historyArmedRef.current) {
      window.history.pushState({ unsavedGuard: true }, "", window.location.href);
      historyArmedRef.current = true;
    }
    if (!dirty) {
      // The planted duplicate (if any) is harmless and left in place —
      // removing it would itself require a history mutation with its own
      // edge cases, for no real benefit. A future dirty cycle re-arms
      // fresh from wherever the contractor is by then.
      historyArmedRef.current = false;
    }
  }, [dirty]);

  useEffect(() => {
    function onPopState() {
      if (bypassNextPopStateRef.current) {
        bypassNextPopStateRef.current = false;
        return;
      }
      if (!dirtyRef.current) return;
      window.history.pushState({ unsavedGuard: true }, "", window.location.href);
      setPending({ kind: "history" });
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const stay = useCallback(() => setPending(null), []);

  const discard = useCallback(() => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === "link") {
      router.push(p.href);
      return;
    }
    // One step for the planted duplicate, one for the real step the
    // contractor was actually trying to take.
    bypassNextPopStateRef.current = true;
    window.history.go(-2);
  }, [pending, router]);

  return { pending, stay, discard };
}
