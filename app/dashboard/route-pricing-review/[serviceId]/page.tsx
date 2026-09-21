import { notFound } from "next/navigation";
import { withAdminContractor } from "@/lib/adminContext";
import { loadRoutePricingReview } from "@/lib/electrical/routePricingReview";
import RoutePricingReviewPanel from "./RoutePricingReviewPanel";

export const dynamic = "force-dynamic";

export default async function RoutePricingReviewPage({ params }: { params: { serviceId: string } }) {
  const data = await withAdminContractor((db, ctx) =>
    loadRoutePricingReview(db, ctx.contractorId, params.serviceId));
  if (!data) return notFound();
  return <RoutePricingReviewPanel data={data} />;
}
