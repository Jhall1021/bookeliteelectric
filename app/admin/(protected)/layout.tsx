import { redirect } from "next/navigation";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import AdminNav from "@/components/admin/AdminNav";

export default function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  if (!isAdminAuthenticated()) {
    redirect("/admin/login");
  }

  return (
    <div className="min-h-screen bg-warmwhite">
      <AdminNav />
      <div className="mx-auto max-w-5xl px-6 py-8">{children}</div>
    </div>
  );
}
