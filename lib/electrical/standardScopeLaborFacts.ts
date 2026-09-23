import type { Prisma, PrismaClient } from "@prisma/client";
import type { QuantityFacts } from "../laborOperations";
import { concealedNmSupportCount, CONCEALED_ROUTE_POLICY_KEYS } from "./concealedRouteMaterialConfiguration";

type Db = PrismaClient | Prisma.TransactionClient;

const ROUTE_FEET = 25;
const SERVICES = [
  "exterior-gfci-other-routing",
  "new-ceiling-fan",
  "new-ceiling-light",
  "new-wall-sconce",
] as const;

/**
 * Contractor-owned facts needed to finish the workbook's bounded 25-foot
 * accessible package. Nothing is returned until both support policies were
 * explicitly resolved; a missing decision therefore remains fail-closed.
 */
export async function loadStandardScopeLaborFacts(db: Db, contractorId: string): Promise<Record<string, QuantityFacts>> {
  const rows = await db.contractorPolicyValue.findMany({
    where: {
      contractorId,
      key: { in: [CONCEALED_ROUTE_POLICY_KEYS.supportSpacing, CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination] },
      resolvedAt: { not: null },
    },
    select: { key: true, choice: true, measurement: true },
  });
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const spacing = byKey.get(CONCEALED_ROUTE_POLICY_KEYS.supportSpacing)?.measurement ?? null;
  const terminalChoice = byKey.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice ?? null;
  const terminalSupports = terminalChoice === "YES" ? true : terminalChoice === "NO" ? false : null;
  if (spacing === null || spacing <= 0 || terminalSupports === null) return {};
  const facts = { nmCableSupportCount: concealedNmSupportCount(ROUTE_FEET, spacing, terminalSupports) };
  return Object.fromEntries(SERVICES.map((slug) => [slug, facts]));
}
