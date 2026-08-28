import { redirect } from "next/navigation";

// Per-request rather than prerendered. A redirect() from a statically
// prerendered page is served at the edge without a Location header, so /admin
// — the URL people actually type, and the callback in magic links already
// sent — answered 307 and went nowhere.
export const dynamic = "force-dynamic";

/**
 * Compatibility route. The contractor portal is `/dashboard`.
 *
 * "Admin" described a system operator; these are contractors signing in to
 * their own business's controls. The vocabulary moved with the product, and
 * the old path keeps resolving because bookmarks and sent emails are real.
 */
export default function AdminRootCompatPage() {
  redirect("/dashboard");
}
