import { redirect } from "next/navigation";

// Rendered per-request rather than prerendered. A redirect() from a
// statically prerendered page is served at the edge without a Location
// header, so /admin — the URL an admin actually types — answered 307 and
// went nowhere. Every other admin route is dynamic already because it reads
// the session cookie; this one had nothing to make it dynamic on its own.
export const dynamic = "force-dynamic";

export default function AdminRootPage() {
  redirect("/admin/quotes");
}
