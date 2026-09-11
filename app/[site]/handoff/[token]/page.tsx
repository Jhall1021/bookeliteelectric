"use client";

import HandoffLanding from "@/components/route-assist/HandoffLanding";
import { uploadPhoto } from "@/lib/upload";

// A Device Handoff QR code lands here — docs/design/guided-flow-session-v1.md.
// The [site] segment is resolved the same way every other storefront page
// resolves it (SiteProvider in app/[site]/layout.tsx); this page adds
// nothing tenant-specific of its own.
export default function HandoffTokenPage({ params }: { params: { site: string; token: string } }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <HandoffLanding token={params.token} uploadPhoto={uploadPhoto} />
    </main>
  );
}
