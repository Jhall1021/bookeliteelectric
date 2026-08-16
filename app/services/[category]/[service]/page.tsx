import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";
import Link from "next/link";

export default function ServiceFlowPage({ params }: { params: { category: string; service: string } }) {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href={`/services/${params.category}`} className="text-sm text-electric">
        ← Back to category
      </Link>
      <div className="mt-6">
        <GuidedFlowEngine serviceSlug={params.service} />
      </div>
    </main>
  );
}
