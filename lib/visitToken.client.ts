"use client";

/**
 * The embed's visit token, in the embed's own storage.
 *
 * WHY THIS EXISTS ONLY FOR THE EMBED
 *
 * Hosted and custom-domain storefronts are first-party: the `SameSite=Lax`
 * cookie works, and nothing here runs. Inside a cross-origin iframe that
 * cookie is never sent, so the visit needs an identifier the frame can hold
 * itself and attach explicitly.
 *
 * WHERE IT LIVES
 *
 * `sessionStorage` on the IFRAME's origin, which every current browser
 * partitions by the top-level site. One contractor's page therefore cannot
 * read the token issued on another's, and neither can any script on the parent
 * page — the parent is a different origin and the frame's storage is closed to
 * it. sessionStorage rather than localStorage so a visit does not outlive the
 * browsing session on a shared or public machine.
 *
 * WHAT IT IS NOT
 *
 * Not a credential, not a tenant, and never in a URL. The server resolves the
 * contractor from the site identifier FIRST and only then narrows to a visit
 * within it, so a token from elsewhere resolves to nothing rather than to
 * somebody else's cart.
 */

const KEY = "p2b.visit";

/** 32 bytes, from the platform CSPRNG. */
function mint(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * The token for this embedded visit, minting one on first use.
 *
 * Returns null when storage is unavailable — a locked-down browser, private
 * mode in some configurations — rather than throwing. The caller sends no
 * header, the server issues a cookie that the frame may or may not keep, and
 * the homeowner gets a working single-page experience instead of a crash.
 */
export function embedVisitToken(): string | null {
  try {
    const existing = window.sessionStorage.getItem(KEY);
    if (existing) return existing;
    const token = mint();
    window.sessionStorage.setItem(KEY, token);
    return token;
  } catch {
    return null;
  }
}

/** Forget the visit — used when one is completed, so it cannot be resumed. */
export function clearEmbedVisitToken(): void {
  try { window.sessionStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}
