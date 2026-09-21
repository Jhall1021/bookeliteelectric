import { prisma } from "@/lib/prisma";
import NewServiceForm from "@/components/admin/NewServiceForm";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryName
} from "@/lib/categories";
import { withAdminContractor } from "@/lib/adminContext";
import { availableTrades } from "@/lib/templateProvisioning";

export default async function NewServicePage() {
  // ADR-007: rooted at ContractorCategory. The ids handed to the form are
  // ContractorCategory ids — a new service is attached to this contractor's
  // category, not to the shared taxonomy row.
  // GUARD-ADOPTED (ADR-007a). The explicit contractorId filter is gone — the
  // guard supplies it, so it is no longer load-bearing application code.
  const rows = await withAdminContractor((db) =>
    db.contractorCategory.findMany({
      where: { active: true },
      orderBy: { sortOrder: "asc" },
      include: { canonicalCategory: CANONICAL_CATEGORY_SELECT },
    })
  );
  const categories = rows.map((c) => ({ id: c.id, name: categoryName(c) }));

  // SERVER-AUTHORITATIVE — G2. The trades Price2Book publishes a catalog for,
  // read from TemplateVersion. The list that offers the choice is the same list
  // the API validates against, so the form cannot present an option the server
  // would refuse, and a hand-posted trade cannot get past it.
  const trades = await withAdminContractor((db) => availableTrades(db));

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">New Service</h1>
      <p className="mt-1 text-sm text-slate">
        Start with the customer-facing service, then build its labor, materials, scope and
        calculated price in the guided recipe workspace. New services stay hidden until their
        required inputs are complete and you explicitly approve the price and activation.
      </p>

      <NewServiceForm categories={categories} trades={trades} />
    </div>
  );
}
