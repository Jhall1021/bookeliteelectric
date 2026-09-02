/**
 * Trade enrolment — the ONE writer for ContractorTrade.
 *
 * Enrolment says which canonical catalog a contractor works from. It is
 * durable contractor configuration and version-independent: you enrol in
 * Electrical, not Electrical v1. Guided Setup writes it through the
 * business-profile route; a later Settings page, and Platform Admin acting for
 * a contractor, must write it through THIS function rather than growing a
 * second writer with its own idea of when a swap is safe.
 *
 * THE CALLER OWNS THE TENANT BOUNDARY. `db` is whatever client the caller was
 * handed inside its own guard — an admin route's guarded client, a verifier's
 * raw one. Nothing here resolves a contractor from the request.
 *
 * V1 allows ONE enrolment, which is a UX decision rather than a model one —
 * ContractorTrade is a relation precisely so a second trade is a feature
 * rather than a migration.
 */

import type { PrismaClient } from "@prisma/client";
import { availableTrades, provisionedFromTrade } from "./templateProvisioning";

export type TradeEnrolmentResult =
  | { ok: true }
  | { ok: false; code: "TRADE_HAS_PROVISIONED_SERVICES" | "TRADE_NOT_AVAILABLE"; message: string };

/**
 * Enrol this contractor in a canonical trade, or refuse.
 *
 * `null` withdraws the enrolment. Both directions are refused once the
 * current trade's catalog has been installed: a catalog that has been
 * installed is priced, possibly live and possibly booked against, and
 * withdrawing the enrolment underneath it would leave a storefront
 * advertising work the contractor no longer says they do — a migration, not
 * a setting, and out of scope by design.
 */
export async function setTradeEnrolment(
  db: PrismaClient,
  contractorId: string,
  tradeKey: string | null
): Promise<TradeEnrolmentResult> {
  const existing = await db.contractorTrade.findMany({ where: { contractorId } });

  for (const e of existing) {
    if (e.tradeKey === tradeKey) return { ok: true };
    const provisioned = await provisionedFromTrade(db, contractorId, e.tradeKey);
    if (provisioned > 0) {
      return {
        ok: false,
        code: "TRADE_HAS_PROVISIONED_SERVICES",
        message:
          `You have ${provisioned} service(s) installed from the ${e.tradeKey} catalog. ` +
          `Changing trade would leave them behind, so it isn't something we can do here.`,
      };
    }
  }

  if (tradeKey === null) {
    await db.contractorTrade.deleteMany({ where: { contractorId } });
    return { ok: true };
  }

  // Validated against published catalogs, so an unknown key cannot be
  // enrolled and the list that populates the UI is the list that refuses a
  // typo.
  const trades = await availableTrades(db);
  if (!trades.includes(tradeKey)) {
    return {
      ok: false, code: "TRADE_NOT_AVAILABLE",
      message: `"${tradeKey}" is not a trade Price2Book publishes a catalog for yet.`,
    };
  }

  await db.contractorTrade.deleteMany({ where: { contractorId, tradeKey: { not: tradeKey } } });
  await db.contractorTrade.upsert({
    where: { contractorId_tradeKey: { contractorId, tradeKey } },
    update: {},
    create: { contractorId, tradeKey },
  });
  return { ok: true };
}
