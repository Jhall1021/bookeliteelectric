/**
 * What a contractor CHOOSES TO OFFER.
 *
 * Deliberately a sibling of lib/credentials.ts rather than an extension of it.
 * A credential is a qualification the workforce holds — EPA_608. A capability
 * is a commercial decision about what work the business takes on. The storage
 * shape is the same and the meanings are not, and folding them together would
 * make "we don't do that" indistinguishable from "we're not certified for that".
 *
 * THREE-STATE, NEVER A BOOLEAN DEFAULT.
 *
 * `capabilityState` returns "not-established" | "declared" | "revoked", and
 * there is deliberately NO helper collapsing them to a boolean. A caller that
 * wants one must say which non-declared state it means, so a gate can never
 * silently equate "we never asked this contractor" with "this contractor said
 * no." Both may lead a homeowner to the same place today; they are different
 * facts about the business and onboarding needs to tell them apart.
 *
 * GENERIC. Routing V2 is the first consumer. Nothing here knows about outlets,
 * drywall, raceway, route envelopes or feet.
 */
import type { PrismaClient } from "@prisma/client";

/**
 * The initial vocabulary. Narrow on purpose, and each key means exactly the
 * frozen physical scope of the component it gates — no more.
 */
export const CAPABILITY_KEYS = [
  /**
   * Carefully remove reusable existing baseboard for access, reinstall THE SAME
   * baseboard, basic refastening.
   *
   * Explicitly NOT: replacement trim, repair of damaged trim, caulking, filling
   * cosmetic nail holes, staining, priming, painting. The key is named
   * ..._REINSTALL rather than ..._RESTORATION because "restoration" would
   * promise more than the component does.
   */
  "BASEBOARD_ACCESS_REINSTALL",
  /**
   * Make the required access opening, replace the section, tape, compound, sand,
   * leave ready for primer and paint.
   *
   * Explicitly NOT: primer, paint, wallpaper, decorative finish restoration, or
   * texture matching unless separately supported.
   */
  "DRYWALL_ACCESS_RESTORATION",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type CapabilityState = "not-established" | "declared" | "revoked";

export function isCapabilityKey(k: string): k is CapabilityKey {
  return (CAPABILITY_KEYS as readonly string[]).includes(k);
}

/** One contractor's declared scopes, as facts. Read once, passed to routing. */
export type CapabilityFacts = Readonly<Record<string, CapabilityState>>;

export function capabilityState(
  facts: CapabilityFacts,
  key: string
): CapabilityState {
  return facts[key] ?? "not-established";
}

/**
 * Load a contractor's capability facts.
 *
 * Returned as plain data so the route resolver stays deterministic: routing
 * receives already-resolved facts and never queries a database mid-walk.
 */
export async function loadCapabilityFacts(
  db: PrismaClient,
  contractorId: string
): Promise<CapabilityFacts> {
  const rows = await db.contractorCapability.findMany({
    where: { contractorId },
    select: { key: true, revokedAt: true },
  });
  const facts: Record<string, CapabilityState> = {};
  for (const r of rows) facts[r.key] = r.revokedAt === null ? "declared" : "revoked";
  return facts;
}
