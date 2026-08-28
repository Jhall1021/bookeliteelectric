import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibility route — the portal module lives at /dashboard/service-area. */
export default function AdminCompatPage() {
  redirect("/dashboard/service-area");
}
