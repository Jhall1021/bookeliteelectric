/**
 * Slugs a contractor may not take, because `hostedSlug` occupies the root
 * namespace — `/elite-electric/services` sits beside `/admin` and `/api`.
 *
 * Configuration validation, not tenant security: nothing here protects one
 * contractor from another. It stops a contractor named "api" from shadowing a
 * real route, which is an ugly problem to discover after someone has printed
 * their URL on a van.
 *
 * Includes the paths Price2Book may want for its own marketing site once the
 * legacy Elite redirects are retired.
 *
 * Deliberately its own zero-dependency module rather than living inline in
 * `lib/siteRouting.ts` (which re-exports it unchanged, so existing importers
 * are untouched): `middleware.ts` runs on the Edge runtime and needs this
 * same list to recognize which paths are — and are not — a homeowner
 * storefront, without pulling `siteRouting.ts`'s Prisma import along with it.
 */
export const RESERVED_HOSTED_SLUGS = new Set<string>([
  // Application namespaces.
  "api", "admin", "_next", "static", "public", "assets",
  // Auth and account.
  "login", "logout", "signin", "signup", "auth", "account", "settings",
  // The contractor portal. A contractor taking one of these as a hosted slug
  // would shadow the portal itself — the sharpest version of the van-sticker
  // problem this list exists to prevent.
  "sign-in", "sign-out", "dashboard", "portal", "onboarding", "choose",
  // Platform marketing, kept free for Price2Book itself.
  "pricing", "about", "contact", "blog", "docs", "help", "support",
  "terms", "privacy", "legal", "security", "status",
  // Legacy Elite root paths, reserved while their redirects stand.
  "services", "troubleshooting", "checkout", "quote", "my-visit",
  "service-area", "how-it-works", "why-us",
  // Kept reserved although it is only a compatibility redirect now: a
  // contractor taking this hosted slug would shadow Elite's old links.
  "why-elite",
  // Obvious traps.
  "new", "edit", "delete", "index", "null", "undefined", "www",
]);
