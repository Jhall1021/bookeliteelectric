/**
 * "Let's get your first service ready."
 *
 * A pilot, deliberately narrow: one trade, one service. The page reads
 * everything from stored state on every load and hands it to the wizard; the
 * wizard saves through the real admin APIs and asks for a fresh read. There is
 * no wizard-only state to drift out of step with the product.
 */
import { withAdminContractor } from "@/lib/adminContext";
import { loadFirstServiceWizard } from "@/lib/electrical/firstServiceWizardData";
import FirstServiceWizard from "./FirstServiceWizard";

export const dynamic = "force-dynamic";

export default async function FirstServicePage() {
  const data = await withAdminContractor((db, ctx) => loadFirstServiceWizard(db, ctx.contractorId));
  return <FirstServiceWizard data={data} />;
}
