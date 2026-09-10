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
 *     navigation via `router.push` — but only after first stepping back off
 *     the same-url guard entry (see below) if one is armed, and waiting for
 *     that step to actually land before pushing. Pushing while still on the
 *     guard entry would leave it stranded ahead of the real page — an extra
 *     stop nobody asked for, reachable forever after by pressing Back once
 *     too many times. Stepping off first means the destination's own push
 *     is what truncates it, the same way any ordinary navigation would.
 *
 *   the browser's own back/forward button — PRE-ARMED, NOT REACTIVE
 *     `popstate` cannot be canceled, and by the time any listener runs the
 *     browser has ALREADY committed to whichever entry the press landed
 *     on. A first version of this hook reacted only AFTER that happened —
 *     it looked direction-agnostic on paper, but it was unsafe: this app's
 *     own router keeps a single listener alive for the life of the whole
 *     session (registered once, long before this editor ever mounts), so
 *     it always runs first, and for an already-cached destination it can
 *     synchronously swap the page's content — unmounting this very editor,
 *     and the unsaved edit React state living in it, before this hook's
 *     own listener ever gets a turn. That is a data-loss bug hiding behind
 *     a passing test, not a working design — confirmed live: the previous
 *     version of this hook failed the very "Back → Stay preserves the
 *     edit" case it was meant to guarantee.
 *
 *     The only technique that is actually safe is to make sure the entry
 *     a press WOULD land on is already harmless before the press happens:
 *     the moment an edit makes this editor dirty, one extra history entry
 *     is pushed at this editor's OWN url. Now the entry immediately behind
 *     the current position is identical, in url, to where the browser
 *     already is — so if the user presses Back, the browser lands on a
 *     page whose url never actually changes. This app's router sees no
 *     path difference and never re-renders anything, so this editor is
 *     never at risk of being torn down mid-edit. THAT is what makes "Stay"
 *     trustworthy, not any cleverness in how popstate is handled after the
 *     fact.
 *
 *     Every time that same-url press is caught, another same-url entry is
 *     immediately planted in its place, so a second Back press (after
 *     choosing Stay) is equally safe. This keeps one invariant true for as
 *     long as the contractor stays dirty: the real previous page is always
 *     exactly two steps behind wherever the pointer currently sits — one
 *     for the guard entry, one for the editor's own real entry beneath it
 *     — so "Discard" is always `history.go(-2)`, regardless of how many
 *     Stay/re-arm cycles came before it.
 *
 *     Nothing is pushed until the contractor is actually dirty, and the
 *     guard entry is silently popped back off (via a bypassed `go(-1)`) the
 *     moment a save or cancel clears it with no back/forward press in
 *     between — the common path is untouched by any of this.
 *
 *     HARD LIMITATION, disclosed rather than papered over: the History API
 *     has no way to insert an entry AHEAD of the current position without
 *     destroying whatever real page used to be there. That means arming
 *     this guard — the only way to make Back safe — necessarily discards
 *     any real forward-reachable page the instant an edit begins, whether
 *     or not Back or Forward is ever actually pressed. In practice this
 *     means the browser's own Forward button is simply inert for as long
 *     as this editor is dirty: there is nothing left to traverse to, so
 *     pressing it does nothing — not a data-loss risk (nothing is ever
 *     misdirected), just an unavailable button. There is no way to give
 *     Forward a genuine destination here without either a cross-cutting,
 *     app-wide navigation history of its own (well beyond this one editor)
 *     or the newer, Chromium-only Navigation API (no cross-browser
 *     fallback) — both bigger changes than this guard's own scope.
 */
export type PendingNavigation = { kind: "link"; href: string } | { kind: "history" };

export function useUnsavedChangesGuard(dirty: boolean) {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const [pending, setPending] = useState<PendingNavigation | null>(null);
  // Is a same-url guard entry currently sitting under the pointer?
  const armedRef = useRef(false);
  const bypassNextPopStateRef = useRef(false);
  // Set only when a bypassed pop is a step in a larger sequence (see
  // discard()'s "link" branch) — run once that pop actually lands, never
  // before, so the next real navigation is built on top of the guard entry
  // actually being gone rather than racing its still-pending removal.
  const afterBypassRef = useRef<(() => void) | null>(null);

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

  // Arm the same-url backstop the instant editing starts; silently
  // disarm it if the contractor clears dirty (Save/Cancel) without ever
  // pressing Back — see the header doc for why this has to happen up
  // front rather than reactively.
  useEffect(() => {
    if (dirty) {
      if (armedRef.current) return;
      window.history.pushState({ unsavedGuard: true }, "", window.location.href);
      armedRef.current = true;
    } else if (armedRef.current) {
      bypassNextPopStateRef.current = true;
      window.history.back();
      armedRef.current = false;
    }
  }, [dirty]);

  useEffect(() => {
    function onPopState() {
      if (bypassNextPopStateRef.current) {
        bypassNextPopStateRef.current = false;
        const after = afterBypassRef.current;
        afterBypassRef.current = null;
        if (after) after();
        return;
      }
      if (!dirtyRef.current) return;
      // This press just consumed the same-url guard entry — the browser
      // never actually moved anywhere, so nothing here was ever at risk.
      // Re-arm immediately so a second press is equally safe.
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
      if (armedRef.current) {
        // The guard entry is still sitting under the pointer (arming never
        // gets a chance to disarm itself on this path — a link Discard
        // leaves the page entirely). Step off it FIRST, and only push the
        // real destination once that step has actually landed: pushState
        // always inserts right after wherever the pointer already is, so
        // pushing while still on the guard entry would leave it stranded,
        // reachable forever after by an extra Back press nobody asked for.
        // Doing this in order — wait for the bypassed pop, then push — means
        // the destination's own pushState is the thing that truncates it.
        armedRef.current = false;
        bypassNextPopStateRef.current = true;
        // Deferred one tick: calling router.push synchronously from inside
        // the popstate handler that a history.back() itself produced fights
        // with this app's own router processing that SAME event — it can
        // silently drop the push. Letting that finish first, then pushing,
        // is reliable; doing both in one breath was not.
        afterBypassRef.current = () => { setTimeout(() => router.push(p.href), 0); };
        window.history.back();
      } else {
        router.push(p.href);
      }
      return;
    }
    // Always exactly two steps behind wherever the pointer currently sits:
    // one for the guard entry, one for this editor's own real entry.
    bypassNextPopStateRef.current = true;
    window.history.go(-2);
  }, [pending, router]);

  return { pending, stay, discard };
}
