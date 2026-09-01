import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";
import Link from "next/link";
import { storefrontBaseFor } from "@/lib/storefrontSurface";

export default function ServiceFlowPage({
  params,
}: {
  params: { site: string; category: string; service: string };
}) {
  // Every link below is built from the SURFACE, never from the raw segment.
  const base = storefrontBaseFor(params.site);
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`${base}/services/${params.category}`} className="text-sm text-electric">
        ← Back to category
      </Link>
      <div className="mt-6">
        <GuidedFlowEngine serviceSlug={params.service} />
      </div>
    </main>
  );
}
