import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** Compatibility route — the portal module lives at /dashboard/bookings. */
export default function AdminCompatPage() {
  redirect("/dashboard/bookings");
}
