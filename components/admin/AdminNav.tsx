"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export default function AdminNav() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <header className="border-b border-cardline bg-navy text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-6">
          <span className="font-display text-sm font-bold">Elite Admin</span>
          <Link href="/admin/quotes" className="text-sm text-white/80 hover:text-white">
            Quote Review
          </Link>
          <Link href="/admin/bookings" className="text-sm text-white/80 hover:text-white">
            Bookings
          </Link>
          <Link href="/admin/jobber" className="text-sm text-white/80 hover:text-white">
            Jobber
          </Link>
          <Link href="/admin/services" className="text-sm text-white/80 hover:text-white">
            Services &amp; Pricing
          </Link>
          <Link href="/admin/pricing-settings" className="text-sm text-white/80 hover:text-white">
            Pricing Settings
          </Link>
        </div>
        <button onClick={handleLogout} className="text-sm text-white/60 hover:text-white">
          Log Out
        </button>
      </div>
    </header>
  );
}
