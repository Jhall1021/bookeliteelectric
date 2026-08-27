import { prisma } from "@/lib/prisma";
import NewServiceForm from "@/components/admin/NewServiceForm";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryName,
  soleContractorId,
} from "@/lib/categories";

export default async function NewServicePage() {
  // ADR-007: rooted at ContractorCategory. The ids handed to the form are
  // ContractorCategory ids — a new service is attached to this contractor's
  // category, not to the shared taxonomy row.
  const contractorId = await soleContractorId(prisma, "the new-service form");
  const rows = await prisma.contractorCategory.findMany({
    where: { contractorId, active: true },
    orderBy: { sortOrder: "asc" },
    include: { canonicalCategory: CANONICAL_CATEGORY_SELECT },
  });
  const categories = rows.map((c) => ({ id: c.id, name: categoryName(c) }));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">New Service</h1>
      <p className="mt-1 text-sm text-slate">
        Creates a simple flat-price service with no decision-tree questions — good for
        straightforward replace/install jobs. If this service needs branching questions, it'll
        still need one code update from Claude to build the tree after you create it here.
      </p>

      <NewServiceForm categories={categories} />
    </div>
  );
}
