"use client";

import HandoffLanding from "@/components/route-assist/HandoffLanding";

/**
 * Test-only stand-in for app/[site]/handoff/[token]/page.tsx — same
 * HandoffLanding component, real resolve/capture/complete flow, real
 * GuidedFlowSession + Device Handoff APIs. The ONLY difference is the
 * `uploadPhoto` implementation, injected exactly the way HandoffLanding
 * already accepts it as a prop, no changes to that component.
 *
 * Exists because this development sandbox cannot reach Cloudflare R2 —
 * see docs/design/route-assist-v1.md's cross-device proof note. A local
 * object URL preserves uploadPhoto's real contract (`(file: File) =>
 * Promise<string>`, a usable image reference RouteAssistCapture can render
 * and carry through to the result) without a network call, the same
 * substitution the single-device fixture already makes for its own
 * `fakeUpload`. Nothing about the capture UI, confirmation step, or result
 * shape is bypassed — only the network upload primitive is swapped.
 */
async function fixtureUploadPhoto(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

export default function RouteAssistHandoffFixturePage({ params }: { params: { site: string; token: string } }) {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8">
      <HandoffLanding token={params.token} uploadPhoto={fixtureUploadPhoto} />
    </main>
  );
}
