import { prisma } from "@/lib/prisma";
import NewServiceForm from "@/components/admin/NewServiceForm";

export default async function NewServicePage() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

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
