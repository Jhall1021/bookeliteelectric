/**
 * The first-service pilot support view, for platform staff.
 *
 * Its own module on purpose. lib/platformOnboarding is the onboarding COMMAND
 * module with a reviewed import allowlist; a read-only pilot view does not
 * belong among its authorities. This follows the same shape — the staff
 * authorization and tenant guard via withPlatformContractorFor, a
 * request-bound form for the page — so the page imports this door and never
 * the contractor boundary itself.
 *
 * Read-only. It reuses the wizard's own readiness and adds no judgement.
 */
import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { currentUser } from "./adminContext";
import { withPlatformContractorFor } from "./platformContext";
import { loadPilotDiagnostic, type PilotDiagnostic } from "./electrical/pilotDiagnostic";

type SignedInUser = Awaited<ReturnType<typeof currentUser>>;

export async function pilotDiagnosticFor(db: PrismaClient, user: SignedInUser, contractorId: unknown): Promise<PilotDiagnostic> {
  return withPlatformContractorFor(db, user as never, contractorId, (guarded, _actor, contractor) =>
    loadPilotDiagnostic(guarded, contractor.id));
}

export const platformPilotDiagnostic = async (contractorId: unknown) =>
  pilotDiagnosticFor(prisma, await currentUser(), contractorId);
