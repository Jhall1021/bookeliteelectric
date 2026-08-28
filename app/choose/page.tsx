import { redirect } from "next/navigation";
import { AmbiguousContractorError, resolveAdminContractor } from "@/lib/adminContext";
import { prisma } from "@/lib/prisma";
import ContractorChoices from "@/components/portal/ContractorChoices";

export const dynamic = "force-dynamic";

/**
 * Which business are you working on?
 *
 * An account can belong to more than one contractor, and Price2Book never
 * picks one. Defaulting to the first membership would be indistinguishable
 * from working correctly right up until somebody published a price on the
 * wrong company's storefront — a silent, plausible failure, which is the worst
 * kind.
 *
 * Reached only when the choice is genuinely ambiguous: one membership resolves
 * without asking, and none is refused.
 *
 * Deliberately OUTSIDE /dashboard. The portal layout redirects here when the
 * choice is ambiguous, so a chooser living under that layout would redirect to
 * itself forever.
 */
export default async function ChooseContractorPage() {
  let choices: { contractorId: string; slug: string }[];
  try {
    await resolveAdminContractor();
    // Not ambiguous after all — one membership, or the choice already made.
    redirect("/dashboard");
  } catch (e) {
    if (!(e instanceof AmbiguousContractorError)) throw e;
    choices = e.choices;
  }

  const names = new Map(
    (await prisma.contractor.findMany({
      where: { id: { in: choices.map((c) => c.contractorId) } },
      select: { id: true, name: true, slug: true },
    })).map((c) => [c.id, c]),
  );

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-navy">Which business?</h1>
      <p className="mt-2 text-sm text-slate">
        Your account has access to more than one. Pick the one you want to work on — everything
        you change applies to that business only.
      </p>
      <ContractorChoices
        choices={choices.map((c) => ({
          contractorId: c.contractorId,
          name: names.get(c.contractorId)?.name ?? c.slug,
          slug: names.get(c.contractorId)?.slug ?? c.slug,
        }))}
      />
    </div>
  );
}
