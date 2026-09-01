/**
 * Who may put this contractor's storefront inside their page.
 *
 * `frame-ancestors` is the whole of the answer. There is no other barrier: a
 * page that can frame the embed can present a real contractor's booking flow
 * as its own, collect a homeowner's address inside it, and take a deposit
 * under someone else's name.
 *
 * EXACT ORIGINS, NEVER HOSTNAMES OR WILDCARDS. "eliteelectricnj.com" is not an
 * origin — it does not say which scheme, and http and https are different
 * places. `*.contractor.com` would hand every subdomain anyone can create to
 * whoever creates it.
 *
 * AN EMPTY LIST MEANS NOBODY, not everybody. A contractor who has registered
 * no domain has authorised none, and a list that opens when unset is not an
 * allowlist.
 *
 * THE PARENT IS NEVER TRUSTED FOR ANYTHING ELSE. It cannot assert a
 * contractor, a price, a visit, a booking or an amount — it may only be, or
 * not be, on this list. Everything the storefront does is resolved server-side
 * from the site identifier, exactly as it is on the hosted page.
 */

export type OriginProblem = { code: string; message: string };

/** Scheme + host + optional port, nothing else. No path, no wildcard, no trailing slash. */
export function validateEmbedOrigin(raw: string): OriginProblem | null {
  const value = raw.trim();
  if (!value) return { code: "empty", message: "Enter a website address." };
  if (value.includes("*")) {
    return {
      code: "wildcard",
      message: "Wildcards aren't allowed — name the exact address, like https://yourcompany.com.",
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      code: "unparseable",
      message: "That doesn't look like a website address. Include https:// at the start.",
    };
  }

  // http is refused because a page served over it can be rewritten in transit,
  // and a rewritten parent is a parent that frames whatever it likes. Loopback
  // is the exception the reason itself allows: traffic to 127.0.0.1, ::1 or
  // localhost never leaves the machine, so there is no transit to rewrite.
  // Browsers treat loopback as a secure context for the same reason.
  const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
  if (url.protocol !== "https:" && !LOOPBACK.has(url.hostname)) {
    return {
      code: "insecure",
      message: "The address must start with https:// — a page served over http can be rewritten in transit.",
    };
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    return {
      code: "not-an-origin",
      message: "Give just the site address, without a path — https://yourcompany.com, not a page on it.",
    };
  }
  return null;
}

/** The canonical form stored and compared: scheme + host + port. */
export function normalizeEmbedOrigin(raw: string): string {
  return new URL(raw.trim()).origin;
}

/**
 * The `frame-ancestors` value for one contractor.
 *
 * `'none'` when nothing is registered — which renders the embed unusable, and
 * is the correct failure. An embed nobody can frame is a configuration the
 * contractor can fix; an embed anybody can frame is one they cannot.
 */
export function frameAncestors(origins: readonly string[]): string {
  const allowed = origins.map((o) => o.trim()).filter(Boolean);
  return allowed.length ? `frame-ancestors ${allowed.join(" ")}` : "frame-ancestors 'none'";
}

/** Is this origin allowed to frame that contractor? Exact match, after normalising. */
export function originAllowed(origins: readonly string[], candidate: string | null): boolean {
  if (!candidate) return false;
  let normalized: string;
  try { normalized = normalizeEmbedOrigin(candidate); } catch { return false; }
  return origins.some((o) => {
    try { return normalizeEmbedOrigin(o) === normalized; } catch { return false; }
  });
}
