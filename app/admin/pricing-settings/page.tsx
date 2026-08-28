import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibility route — the portal module lives at /dashboard/pricing-settings. */
export default function AdminCompatPage() {
  redirect("/dashboard/pricing-settings");
}
