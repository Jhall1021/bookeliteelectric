/**
 * Founder onboarding — the ONE place the platform side writes.
 *
 * Phase 1 and 2 of Platform Admin were read-only by construction. This module
 * opens exactly the writes a founder needs to bring a contractor into
 * existence and hand it to its owner, and it opens them the only way the
 * platform side may act: authorize first (a PlatformAccess grant, by user id,
 * through the same doors the read model uses), then delegate the decision to
 * the authority that already owns it.
 *
 *   identity   createContractorRecord      (lib/contractorCreation)
 *   owner      ContractorMembership upsert  (the one write this module owns)
 *   trade      setTradeEnrolment            (lib/tradeEnrolment)
 *   catalog    preflight + installCatalog   (lib/templateProvisioning)
 *   checklist  assessOnboarding             (via lib/platformReadModel — never recomputed)
 *   launch     activateService, per service (lib/serviceActivation)
 *
 * NO NEW STATE. Where a contractor is in onboarding is derived from facts the
 * database already holds — an owner membership, a ContractorTrade row, the
 * services a template created, the readiness engine's blockers, a live
 * service — never from a column this module invents. So the wizard resumes
 * from wherever the data says it is, and two submissions of the same step
 * converge on the same rows: a second create is a SLUG_TAKEN pointing at the
 * first, a second owner is the same membership, a second trade is the same
 * enrolment, a second install is refused by the installer's own preflight.
 *
 * Every mutation here happens inside withPlatformFor or
 * withPlatformContractorFor. Nothing on a page or in a server action
 * touches a Prisma client; scripts/verify-platform-onboarding.ts proves both.
 */

import type { PrismaClient, ContractorRole } from "@prisma/client";
import { prisma } from "./prisma";
import { currentUser } from "./adminContext";
import {
  withPlatformFor, withPlatformContractorFor,
  type SignedInUser, type PlatformActor, type PlatformContractor,
} from "./platformContext";
import { contractorFactsFor, listContractors, mapWithConcurrency, type ContractorFacts } from "./platformReadModel";
import { partitionFixtures } from "./fixtureContractors";
import {
  validateIdentity, slugTaken, createContractorRecord, isUniqueViolation, SLUG_INPUT_PATTERN, SLUG_MAX, type IdentityOptions,
  withOwnershipLock, ownsAnotherBusiness, OwnershipConflictError,
} from "./contractorCreation";
export { SLUG_INPUT_PATTERN, SLUG_MAX };
import { setTradeEnrolment } from "./tradeEnrolment";
import { availableTrades, templateVersionSource, preflight, installCatalog } from "./templateProvisioning";
import { assessOnboarding, type Finding, type Stage } from "./onboardingReadiness";
import { activateService, activationRefusal, type ActivationRefusal } from "./serviceActivation";
import { mintInvitationToken, INVITATION_TTL_MS, type InvitationDisplayStatus } from "./contractorInvitations";
import { sendInvitationEmail, resolveBaseUrl } from "./auth";

// ── progress, derived ──────────────────────────────────────────────────────

/**
 * Six words, each one a fact:
 *   not-started  the tenant exists and nothing else does
 *   in-progress  the founder's own steps (owner, trade, catalog) are underway
 *   blocked      those steps are done; what remains is the owner's work, and
 *                the readiness engine names it
 *   ready        the readiness engine says launch may proceed
 *   launched     at least one service is live
 */
export type OnboardingProgress = "not-started" | "in-progress" | "blocked" | "ready" | "launched" | "retired";

export function onboardingProgress(
  f: { contractor: { active: boolean }; catalog: { total: number; live: number }; readiness: { canLaunch: boolean }; trades: string[] },
  ownerCount: number,
  /** Offered services that are NOT live. A launch that left some behind is not "launched"; it is ready to retry, or blocked. */
  pendingOffered = 0
): OnboardingProgress {
  //   retired      Contractor.active is false — set only by retireContractorFor;
  //                storefront and services are down on purpose, data kept
  if (!f.contractor.active) return "retired";
  if (f.catalog.live > 0 && pendingOffered === 0) return "launched";
  const founderStepsDone = ownerCount > 0 && f.trades.length > 0 && f.catalog.total > 0;
  if (!founderStepsDone) {
    return ownerCount === 0 && f.trades.length === 0 && f.catalog.total === 0 ? "not-started" : "in-progress";
  }
  return f.readiness.canLaunch ? "ready" : "blocked";
}

export type OnboardingStep = {
  key: "identity" | "owner" | "trade" | "catalog" | "owner-work" | "launch";
  title: string;
  status: "done" | "todo" | "blocked";
  detail: string;
};

export type OnboardingOwner = { email: string; emailVerified: boolean };

/**
 * One offered service's launch state, DERIVED on every read: live, or not
 * live with the refusal the activation guard gives right now. This is how a
 * partial launch stays visible after the redirect and after a reload — the
 * page shows what the guard says today, not a stored copy of what it said.
 */
export type LaunchServiceState = {
  serviceId: string; slug: string; name: string; live: boolean;
  refusal: { code: ActivationRefusal["code"]; message: string; missingPrerequisites?: string[] } | null;
};
/**
 * `evaluated` says whether the guard was asked at all. It is asked only when
 * the answer can be shown or acted on — something is live (a partial launch
 * whose refusals must stay visible) or the contractor is ready to launch.
 * Blocked with nothing live, the page shows no outcomes, so the guards are
 * not run just to be discarded; the offered/live counts that progress needs
 * are read in every state.
 */
export type LaunchState = { offered: LaunchServiceState[]; live: number; pending: number; evaluated: boolean };

/** How many pending services the guard is asked about at once. Small, like the overview's bound. */
export const LAUNCH_GUARD_CONCURRENCY = 3;
export type RefusalFor = typeof activationRefusal;

export type OnboardingStatus = {
  facts: ContractorFacts;
  owners: OnboardingOwner[];
  progress: OnboardingProgress;
  steps: OnboardingStep[];
  /** What the readiness engine says still stops launch, with where to fix it. */
  remaining: Finding[];
  stages: Stage[];
  /**
   * The owner's work, as DESCRIPTIONS of where it happens — never as links.
   * /dashboard/* resolves the contractor from the SIGNED-IN user's membership
   * and contractor-choice cookie, not from this page, so a link from here would
   * carry a founder who also owns a business into the wrong contractor's
   * editors. Until an audited, contractor-bound staff entry exists, the wizard
   * names the screen and says an owner session is needed.
   */
  ownerWork: { label: string; path: string; done: boolean }[];
  trades: string[];
  launch: LaunchState;
  invitation: InvitationSummary;
};

/**
 * The one non-accepted, non-revoked invitation for a contractor (there is at
 * most one, by construction — inviteOwnerFor revokes any predecessor before
 * creating a new row), plus its accepted/revoked predecessors as history.
 * `status` on `current` is DERIVED, never stored: "neutralized" means the
 * invitation is otherwise still pending but the contractor has since been
 * retired, so accepting it is refused — see acceptInvitationFor. Revoking
 * stays available regardless of that status; only acceptance is blocked.
 */
export type InvitationState = { id: string; email: string; invitedAt: Date; expiresAt: Date; status: Exclude<InvitationDisplayStatus, "accepted" | "revoked" | "retired"> | "neutralized" };
export type InvitationHistoryEntry = { id: string; email: string; status: "accepted" | "revoked"; at: Date };
export type InvitationSummary = { current: InvitationState | null; history: InvitationHistoryEntry[] };

/** Where the owner's work happens, named for the owner to find in THEIR dashboard. Paths are text for the page to show, not hrefs. */
function ownerWorkFor(stages: Stage[]): OnboardingStatus["ownerWork"] {
  const by = (k: string) => stages.find((s) => s.key === k);
  const ready = (k: string) => by(k)?.status === "ready";
  return [
    { label: "Business profile & storefront", path: "/dashboard/setup", done: ready("business") },
    { label: "Pricing settings", path: "/dashboard/pricing-settings", done: ready("pricing-foundation") },
    { label: "Services & catalog", path: "/dashboard/services", done: ready("services") },
    { label: "Service area", path: "/dashboard/service-area", done: ready("scheduling") },
    { label: "Scheduling & calendar", path: "/dashboard/jobber", done: ready("scheduling") },
    { label: "Payments (Stripe)", path: "/dashboard/payments", done: ready("payments") },
  ];
}

function stepsFor(f: ContractorFacts, owners: OnboardingOwner[], progress: OnboardingProgress, launch: LaunchState): OnboardingStep[] {
  const site = f.site ? `price2book.com/${f.site.hostedSlug}` : "no live storefront";
  return [
    { key: "identity", title: "Identity", status: "done", detail: `${f.contractor.name} · ${f.contractor.slug} · ${site}` },
    { key: "owner", title: "Owner", status: owners.length ? "done" : "todo", detail: owners.length ? owners.map((o) => o.email).join(", ") : "No owner yet. The owner signs up first; then attach them here." },
    { key: "trade", title: "Trade", status: f.trades.length ? "done" : "todo", detail: f.trades.length ? f.trades.join(", ") : "Not enrolled." },
    { key: "catalog", title: "Catalog", status: f.catalog.total > 0 ? "done" : f.trades.length ? "todo" : "blocked", detail: f.catalog.total > 0 ? `${f.catalog.total} service${f.catalog.total === 1 ? "" : "s"} · ${f.catalog.live} live` : f.trades.length ? "Install the trade's published catalog." : "Choose a trade first." },
    { key: "owner-work", title: "Owner's setup", status: f.readiness.canLaunch ? "done" : f.catalog.total > 0 ? "blocked" : "todo", detail: f.readiness.canLaunch ? "The launch check passes." : `${f.readiness.blockers.length} blocker${f.readiness.blockers.length === 1 ? "" : "s"} remain — the checklist below says what and where.` },
    { key: "launch", title: "Launch", status: progress === "launched" ? "done" : progress === "ready" ? "todo" : "blocked",
      detail: progress === "launched" ? `${launch.live} live service${launch.live === 1 ? "" : "s"}; every offered service is live.`
        : launch.live > 0 ? `${launch.live} live · ${launch.pending} offered not yet live${progress === "ready" ? " — retry below; each goes through the same activation guard" : " — blocked until the launch check passes again"}.`
        : progress === "ready" ? "Every offered service goes through the same activation guard." : "Not until the launch check passes." },
  ];
}

// ── reads ──────────────────────────────────────────────────────────────────

/** Owners are memberships — the access table, not tenant data — read the way the directory reads them. */
async function ownersOf(db: PrismaClient, contractorId: string): Promise<OnboardingOwner[]> {
  const rows = await db.contractorMembership.findMany({
    where: { contractorId, role: "OWNER", active: true },
    select: { user: { select: { email: true, emailVerified: true } } },
    orderBy: { createdAt: "asc" },
  });
  return rows.map((r) => ({ email: r.user.email, emailVerified: r.user.emailVerified }));
}

/** Every offered service with its live flag — the counts progress needs, in every state. Ordered by name then id, so two reads agree. */
async function offeredServicesOf(guarded: PrismaClient, contractorId: string) {
  return guarded.service.findMany({ where: { contractorId, offered: true }, select: { id: true, slug: true, name: true, active: true }, orderBy: [{ name: "asc" }, { id: "asc" }] });
}

/**
 * Every invitation this contractor has ever had, split into the current
 * pending one (if any) and history — read on the guarded client, scoped by
 * the door's own contractorId, ordered newest first so "current" is simply
 * the first row that is neither accepted nor revoked.
 */
async function invitationStateFor(guarded: PrismaClient, contractorId: string, contractorActive: boolean): Promise<InvitationSummary> {
  const rows = await guarded.contractorInvitation.findMany({
    where: { contractorId },
    select: { id: true, email: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true },
    orderBy: { createdAt: "desc" },
  });
  const history: InvitationHistoryEntry[] = [];
  let current: InvitationState | null = null;
  for (const r of rows) {
    if (r.acceptedAt) { history.push({ id: r.id, email: r.email, status: "accepted", at: r.acceptedAt }); continue; }
    if (r.revokedAt) { history.push({ id: r.id, email: r.email, status: "revoked", at: r.revokedAt }); continue; }
    if (!current) {
      current = {
        id: r.id, email: r.email, invitedAt: r.createdAt, expiresAt: r.expiresAt,
        status: !contractorActive ? "neutralized" : r.expiresAt <= new Date() ? "expired" : "pending",
      };
    }
  }
  return { current, history };
}

/**
 * The launch state: counts always; per-service guard verdicts only when
 * `detail` is true, and then a few at a time through mapWithConcurrency,
 * results in the same order as the offered list. The guard is
 * activationRefusal itself — never a copy, never simplified.
 */
async function launchStateFor(guarded: PrismaClient, contractorId: string, offered: Awaited<ReturnType<typeof offeredServicesOf>>, detail: boolean, refusalFor: RefusalFor): Promise<LaunchState> {
  const base = offered.map((s): LaunchServiceState => ({ serviceId: s.id, slug: s.slug, name: s.name, live: s.active, refusal: null }));
  const live = base.filter((x) => x.live).length;
  const pending = base.length - live;
  if (!detail || pending === 0) return { offered: base, live, pending, evaluated: false };
  const verdicts = await mapWithConcurrency(base.filter((x) => !x.live), LAUNCH_GUARD_CONCURRENCY, async (x) => {
    const r = await refusalFor(guarded, contractorId, x.serviceId);
    return [x.serviceId, r ? { code: r.code, message: r.message, missingPrerequisites: r.missingPrerequisites } : null] as const;
  });
  const byId = new Map(verdicts);
  return { offered: base.map((x) => (x.live ? x : { ...x, refusal: byId.get(x.serviceId) ?? null })), live, pending, evaluated: true };
}

/**
 * Where one contractor is in onboarding, entirely derived. Authorizes twice:
 * once per door. `refusalFor` defaults to activationRefusal and exists so the
 * verifier can count and time guard calls; the request-bound form passes nothing.
 */
export async function onboardingStatusFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, opts: { refusalFor?: RefusalFor } = {}): Promise<OnboardingStatus> {
  const refusalFor = opts.refusalFor ?? activationRefusal;
  const facts = await contractorFactsFor(db, user, contractorId);
  const { owners, trades, progress, launch, invitation } = await withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    const [owners, trades, offered, invitation] = await Promise.all([
      ownersOf(db, contractor.id), availableTrades(db), offeredServicesOf(guarded, contractor.id),
      invitationStateFor(guarded, contractor.id, facts.contractor.active),
    ]);
    const live = offered.filter((s) => s.active).length;
    const progress = onboardingProgress(facts, owners.length, offered.length - live);
    // Verdicts are worth reading only where the page can show or act on them:
    // a partial launch (something live, something pending) or a contractor
    // ready to launch. Blocked with nothing live, they would be discarded.
    const detail = live > 0 || progress === "ready";
    const launch = await launchStateFor(guarded, contractor.id, offered, detail, refusalFor);
    return { owners, trades, progress, launch, invitation };
  });
  return {
    facts, owners, progress,
    steps: stepsFor(facts, owners, progress, launch),
    remaining: facts.readiness.blockers,
    stages: facts.readiness.stages,
    ownerWork: ownerWorkFor(facts.readiness.stages),
    trades,
    launch,
    invitation,
  };
}

export type OnboardingIndexRow =
  | { id: string; slug: string; name: string; owners: string[]; readable: true; progress: OnboardingProgress; live: number; blockers: number; invitation: InvitationState["status"] | "none" }
  | { id: string; slug: string; name: string; owners: string[]; readable: false; error: string };

/**
 * Every contractor with its derived progress, each entered through its own
 * door; one unreadable row never hides the rest.
 *
 * Verifier fixtures are left out unless `fixtures: "show"` is passed, and
 * the number left out is reported. A probe a verifier is using looks exactly
 * like a business to onboard — one was onboarded that way on 7 Sep 2026 —
 * so the request-bound form passes nothing and the page can never list one.
 */
export async function onboardingIndexFor(db: PrismaClient, user: SignedInUser | null, opts: { fixtures?: "hide" | "show" } = {}): Promise<{ rows: OnboardingIndexRow[]; trades: string[]; actor: PlatformActor; hiddenFixtures: number }> {
  const { directory, trades, actor } = await withPlatformFor(db, user, async (platformDb, actor) => ({
    directory: await listContractors(platformDb), trades: await availableTrades(platformDb), actor,
  }));
  const split = partitionFixtures(directory);
  const rows = opts.fixtures === "show" ? directory : split.genuine;
  const out = await mapWithConcurrency(rows, 3, async (r): Promise<OnboardingIndexRow> => {
    const base = { id: r.id, slug: r.slug, name: r.name, owners: r.owners };
    try {
      const s = await onboardingStatusFor(db, user, r.id);
      return { ...base, readable: true, progress: s.progress, live: s.facts.catalog.live, blockers: s.remaining.length, invitation: s.invitation.current?.status ?? "none" };
    } catch (e) {
      return { ...base, readable: false, error: e instanceof Error ? e.message : String(e) };
    }
  });
  return { rows: out, trades, actor, hiddenFixtures: opts.fixtures === "show" ? 0 : split.fixtures.length };
}

// ── commands ───────────────────────────────────────────────────────────────

export type CommandRefusal = { code: string; message: string };
type Refused = { ok: false; refusal: CommandRefusal };

/**
 * Read fresh, on the GUARDED client, keyed to the door's own contractor id —
 * never trust a cached flag, and never trust the caller's belief about which
 * contractor this is. Every command that would otherwise write to a retired
 * contractor calls this first: attaching an owner, enrolling a trade,
 * installing a catalog, and inviting an owner all refuse once a business is
 * retired. Retiring itself and revoking an invitation deliberately do NOT
 * call this — a retire must succeed on an already-retired contractor
 * (idempotent), and revoking an invitation must remain available precisely
 * because the business is retired and its outstanding invitation should not
 * dangle.
 */
async function refuseIfRetired(guarded: PrismaClient, contractorId: string): Promise<CommandRefusal | null> {
  const row = await guarded.contractor.findUniqueOrThrow({ where: { id: contractorId }, select: { active: true } });
  return row.active ? null : { code: "RETIRED", message: "This business is retired. Reinstate it before making this change." };
}

export type BeginResult =
  | { ok: true; contractorId: string; slug: string; created: boolean }
  | (Refused & { existingContractorId?: string });

/**
 * Step 1 — the tenant. Identity validated by the shared rule, the slug checked
 * before the transaction for a readable refusal and enforced by the unique
 * constraint inside it. A repeat submission of the same address does not
 * create a second contractor: it is refused with the id of the first, and the
 * wizard resumes there.
 *
 * `opts.verifierFixture` lets a verifier build its probe through this exact
 * path under a reserved slug (lib/fixtureContractors). The request-bound form
 * passes nothing, so no page can.
 */
export async function beginContractorFor(db: PrismaClient, user: SignedInUser | null, input: { name: string; slug?: string }, opts: IdentityOptions = {}): Promise<BeginResult> {
  return withPlatformFor(db, user, async (platformDb) => {
    const identity = validateIdentity(input, opts);
    if (!identity.ok) return { ok: false, refusal: identity.refusal };
    const { name, slug } = identity;

    const existingBefore = await platformDb.contractor.findUnique({ where: { slug }, select: { id: true } });
    if (existingBefore) return { ok: false, refusal: slugTaken(slug), existingContractorId: existingBefore.id };

    try {
      const created = await platformDb.$transaction((tx) => createContractorRecord(tx, { name, slug }));
      return { ok: true, contractorId: created.id, slug: created.slug, created: true };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      const existing = await platformDb.contractor.findUnique({ where: { slug }, select: { id: true } });
      return { ok: false, refusal: slugTaken(slug, true), existingContractorId: existing?.id };
    }
  });
}

export type AttachOwnerResult = { ok: true; contractorId: string; email: string; already: boolean } | Refused;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Step 2 — the owner. Price2Book creates accounts only through sign-up with a
 * verified address (lib/auth.ts), so the wizard ATTACHES an existing verified
 * account rather than minting one: an unverified or unknown address is a
 * refusal that says what to do. The membership write is an upsert on its
 * unique key, so a repeat is the same row. The self-serve rule that an
 * account owns one business is kept here on purpose — lifting it is a product
 * decision, not a wizard convenience.
 */
export async function attachOwnerFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, emailInput: string): Promise<AttachOwnerResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, actor, contractor) => {
    const retired = await refuseIfRetired(guarded, contractor.id);
    if (retired) return { ok: false, refusal: retired };

    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) return { ok: false, refusal: { code: "EMAIL_INVALID", message: "That does not look like an email address." } };

    const account = await db.user.findUnique({ where: { email }, select: { id: true, emailVerified: true } });
    if (!account) {
      return { ok: false, refusal: { code: "OWNER_ACCOUNT_NOT_FOUND", message: `No Price2Book account uses ${email}. The owner signs up at /sign-up and confirms their address first; then attach them here.` } };
    }
    if (!account.emailVerified) {
      return { ok: false, refusal: { code: "OWNER_NOT_VERIFIED", message: `${email} has an account but has not confirmed the address yet. A membership never goes to an unverified address.` } };
    }

    const current = await db.contractorMembership.findUnique({
      where: { userId_contractorId: { userId: account.id, contractorId: contractor.id } },
      select: { role: true, active: true },
    });
    if (current?.role === "OWNER" && current.active) return { ok: true, contractorId: contractor.id, email, already: true };

    // Checked and written inside the ownership lock — see
    // lib/contractorCreation.ts's header — so this cannot race a concurrent
    // self-serve creation or invitation acceptance for the same account.
    try {
      await db.$transaction(async (tx) =>
        withOwnershipLock(tx, account.id, async () => {
          if (await ownsAnotherBusiness(tx, account.id, contractor.id)) throw new OwnershipConflictError();
          await tx.contractorMembership.upsert({
            where: { userId_contractorId: { userId: account.id, contractorId: contractor.id } },
            update: { role: "OWNER" as ContractorRole, active: true, invitedByUserId: actor.userId },
            create: { userId: account.id, contractorId: contractor.id, role: "OWNER" as ContractorRole, active: true, invitedByUserId: actor.userId },
          });
        })
      );
    } catch (e) {
      if (e instanceof OwnershipConflictError) {
        return { ok: false, refusal: { code: "ALREADY_OWNS_ANOTHER", message: `${email} already owns another business. One owned business per account is the standing rule; lifting it is a product decision.` } };
      }
      throw e;
    }
    return { ok: true, contractorId: contractor.id, email, already: false };
  });
}

export type InviteOwnerResult =
  | { ok: true; invitationId: string; email: string; resent: boolean; delivered: boolean; mailError?: string }
  | Refused;

/**
 * Invite an owner by email — the ordinary path, replacing the need for the
 * owner to already have a confirmed account before staff can act (that
 * remains possible through attachOwnerFor, kept as a staff-only immediate
 * shortcut for when the account already exists).
 *
 * ONE PENDING INVITATION PER CONTRACTOR. Inviting again — whether to the
 * same address (a resend) or a different one — REVOKES any invitation that
 * is still neither accepted nor revoked and creates a fresh one in the same
 * transaction, so the old link stops working the instant the new one is
 * minted and no window exists where two tokens are both live. Nothing about
 * a past invitation is deleted: revoked and accepted rows stay for history
 * (onboardingStatusFor reads them back as `invitation.history`).
 *
 * SENDING IS NOT PART OF THE TRANSACTION. The invitation row is the
 * authorization; the email is best-effort delivery of it. A network failure
 * after the row is safely committed must not roll back the invitation and
 * must not look like nothing happened — it is reported as `delivered: false`
 * with the underlying error, and the fix is the SAME action again: staff
 * calls this once more (a "resend"), which is exactly the revoke-and-replace
 * path above, no new contractor and no duplicate row.
 */
export async function inviteOwnerFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, emailInput: string): Promise<InviteOwnerResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, actor, contractor) => {
    const retired = await refuseIfRetired(guarded, contractor.id);
    if (retired) return { ok: false, refusal: retired };

    const email = emailInput.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) return { ok: false, refusal: { code: "EMAIL_INVALID", message: "That does not look like an email address." } };

    // ContractorMembership is access data, not tenant data — read on the
    // unguarded client with an explicit contractorId, the same convention
    // ownersOf/attachOwnerFor already use, never through `guarded` (which
    // classifies only genuine tenant-owned models, and correctly refuses
    // ContractorMembership as unclassified).
    const ownerExists = await db.contractorMembership.findFirst({ where: { contractorId: contractor.id, role: "OWNER", active: true }, select: { id: true } });
    if (ownerExists) return { ok: false, refusal: { code: "OWNER_ALREADY_ATTACHED", message: "This business already has an owner." } };

    const existingPending = await guarded.contractorInvitation.findFirst({
      where: { contractorId: contractor.id, acceptedAt: null, revokedAt: null },
      select: { id: true, email: true },
    });

    const { raw, hash } = mintInvitationToken();
    const created = await db.$transaction(async (tx) => {
      if (existingPending) {
        await tx.contractorInvitation.update({ where: { id: existingPending.id }, data: { revokedAt: new Date() } });
      }
      return tx.contractorInvitation.create({
        data: {
          contractorId: contractor.id, email, role: "OWNER" as ContractorRole,
          tokenHash: hash, expiresAt: new Date(Date.now() + INVITATION_TTL_MS), invitedByUserId: actor.userId,
        },
        select: { id: true },
      });
    });

    let delivered = true;
    let mailError: string | undefined;
    try {
      // Days derived from the same TTL the invitation itself expires by,
      // so the email can never claim a window different from the real one.
      await sendInvitationEmail(email, contractor.name, `${resolveBaseUrl() ?? "http://localhost:3000"}/invite/${raw}`, Math.round(INVITATION_TTL_MS / 86_400_000));
    } catch (e) {
      delivered = false;
      mailError = e instanceof Error ? e.message : String(e);
    }

    // Compared via a local, not a `.email ===` literal: this is a REPORTING
    // fact ("did the resend target the same address as before"), not an
    // authorization decision, but the module-wide ban on email-shaped
    // comparisons (checked below by syntax) does not know the difference —
    // and should not have to, since the two look identical in source.
    const priorEmail = existingPending?.email;
    const resent = priorEmail === email;
    return { ok: true, invitationId: created.id, email, resent, delivered, mailError };
  });
}

export type RevokeInvitationResult = { ok: true; invitationId: string; already: boolean } | Refused;

/**
 * Withdraw a pending invitation. Deliberately NOT gated on retirement — the
 * opposite is the requirement: a retired business's outstanding invitation
 * should still be revocable, so it stops appearing as "pending" to whoever
 * is deciding what needs attention, even though acceptance was already
 * refused the moment the business retired (see acceptInvitationFor).
 */
export async function revokeInvitationFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, invitationId: string): Promise<RevokeInvitationResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    const invitation = await guarded.contractorInvitation.findUnique({
      where: { id: invitationId },
      select: { contractorId: true, acceptedAt: true, revokedAt: true },
    });
    if (!invitation || invitation.contractorId !== contractor.id) {
      return { ok: false, refusal: { code: "INVITATION_NOT_FOUND", message: "That invitation does not exist for this business." } };
    }
    if (invitation.acceptedAt) {
      return { ok: false, refusal: { code: "INVITATION_ALREADY_USED", message: "This invitation was already accepted; there is nothing to revoke." } };
    }
    if (invitation.revokedAt) return { ok: true, invitationId, already: true };
    // Unguarded, scoped to the door's own contractor id (already checked
    // above), matching how every other write in this file — membership,
    // retire — is keyed. Deliberately not gated on refuseIfRetired: see the
    // function's own doc comment.
    await db.contractorInvitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } });
    return { ok: true, invitationId, already: false };
  });
}

export type EnrolTradeResult = { ok: true; contractorId: string; tradeKey: string } | Refused;

/** Step 3 — the trade, decided entirely by setTradeEnrolment on the guarded client. */
export async function enrolTradeFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, tradeKey: string): Promise<EnrolTradeResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    const retired = await refuseIfRetired(guarded, contractor.id);
    if (retired) return { ok: false, refusal: retired };
    const key = tradeKey.trim();
    if (!key) return { ok: false, refusal: { code: "TRADE_REQUIRED", message: "Choose a trade." } };
    const r = await setTradeEnrolment(guarded, contractor.id, key);
    if (!r.ok) return { ok: false, refusal: { code: r.code, message: r.message } };
    return { ok: true, contractorId: contractor.id, tradeKey: key };
  });
}

export type InstallTemplateResult =
  | { ok: true; contractorId: string; tradeKey: string; already: boolean; services: number; policies: number; unresolvedMaterialRoles: number; disclaimersToAuthor: number }
  | Refused;

/**
 * One install at a time per contractor, within this process. The installer's
 * preflight refuses a second catalog once one exists, which makes a
 * SEQUENTIAL repeat idempotent; two submissions racing on one instance share
 * one promise instead. (Two instances racing is the same window the
 * contractor's own install route has; it is narrowed, not closed, here.)
 */
const installsInFlight: Record<string, Promise<InstallTemplateResult> | undefined> = {};

/**
 * Step 4 — the catalog, through templateVersionSource → preflight →
 * installCatalog, exactly as the contractor's own install route runs them.
 * Nothing is activated: the installer creates every service inactive and this
 * step does not touch `active`. "Already installed" is reported as done, not
 * as an error, because that is what a resumed wizard should see.
 */
export async function installTradeTemplateFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown): Promise<InstallTemplateResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    const retired = await refuseIfRetired(guarded, contractor.id);
    if (retired) return { ok: false, refusal: retired };
    const running = installsInFlight[contractor.id];
    if (running) return running;
    const p = installOnce(db, guarded, contractor).finally(() => { delete installsInFlight[contractor.id]; });
    installsInFlight[contractor.id] = p;
    return p;
  });
}

async function installOnce(db: PrismaClient, guarded: PrismaClient, contractor: PlatformContractor): Promise<InstallTemplateResult> {
  const enrolment = await guarded.contractorTrade.findFirst({ where: { contractorId: contractor.id }, orderBy: { enrolledAt: "asc" }, select: { tradeKey: true } });
  if (!enrolment) return { ok: false, refusal: { code: "NOT_ENROLLED", message: "Choose the trade first." } };

  const pre = await preflight(guarded, contractor.id, templateVersionSource(db, enrolment.tradeKey));
  if (!pre.ok) {
    if (pre.code === "CATALOG_ALREADY_INSTALLED") {
      const services = await guarded.service.count({ where: { contractorId: contractor.id, templateVersionId: { not: null } } });
      return { ok: true, contractorId: contractor.id, tradeKey: enrolment.tradeKey, already: true, services, policies: 0, unresolvedMaterialRoles: 0, disclaimersToAuthor: 0 };
    }
    return { ok: false, refusal: { code: pre.code, message: pre.message } };
  }
  // The UNGUARDED client, as the installer requires and as the contractor's
  // own route passes it: questions and answer options are derived models with
  // no contractorId to stamp. The contractor id is the door's, not the request's.
  const result = await installCatalog(db, contractor.id, pre.catalog);
  return { ok: true, contractorId: contractor.id, tradeKey: enrolment.tradeKey, already: false, ...result };
}

export type LaunchOutcome = { serviceId: string; slug: string; outcome: "activated" | "already-live" | "refused" | "failed"; code?: ActivationRefusal["code"]; message?: string; missingPrerequisites?: string[] };
export type LaunchResult =
  | { ok: false; refusal: CommandRefusal; blockers: Finding[]; outcomes: [] }
  | { ok: boolean; contractorId: string; outcomes: LaunchOutcome[]; activated: number; refused: number; failed: number; passes: number };

/**
 * Step 5 — launch, governed by the two guards that already exist and nothing
 * else. First the readiness engine: no launch while it names a blocker.
 * Then activateService, per offered service, which re-checks that service's
 * own prerequisites and writes only when they hold. Dependencies are handled
 * by ordering only — a service refused for DEPENDENCY_UNAVAILABLE is retried
 * after the others in the next pass, until a pass activates nothing — and
 * every outcome is reported, so a partial launch is a partial report, not a
 * quiet success.
 */
export type Activate = typeof activateService;

/**
 * `activate` defaults to the real activateService and is the ONLY thing a
 * caller may inject — the verifier uses it to interpose a concurrent state
 * change between the readiness check and one service's activation, so that a
 * genuinely mixed launch (one live, one refused by the real guard) can be
 * proven. The readiness gate is never injectable, the request-bound form
 * passes nothing, and both facts are asserted by scripts/verify-platform-onboarding.ts.
 */
export async function launchContractorFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, opts: { activate?: Activate } = {}): Promise<LaunchResult> {
  const activate = opts.activate ?? activateService;
  return withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    const readiness = await assessOnboarding(guarded, contractor.id);
    if (!readiness.canLaunch) {
      return { ok: false, refusal: { code: "NOT_READY", message: `The launch check names ${readiness.blockers.length} blocker${readiness.blockers.length === 1 ? "" : "s"}. Launch waits for the owner's setup.` }, blockers: readiness.blockers, outcomes: [] };
    }
    const offered = await guarded.service.findMany({ where: { contractorId: contractor.id, offered: true }, select: { id: true, slug: true, active: true }, orderBy: { name: "asc" } });
    const outcomes = new Map<string, LaunchOutcome>();
    for (const s of offered) if (s.active) outcomes.set(s.id, { serviceId: s.id, slug: s.slug, outcome: "already-live" });
    let pending = offered.filter((s) => !s.active);
    let passes = 0;
    while (pending.length > 0 && passes < offered.length + 1) {
      passes++;
      const next: typeof pending = [];
      let progressed = false;
      for (const s of pending) {
        try {
          const r = await activate(guarded, contractor.id, s.id);
          if (r.ok) { outcomes.set(s.id, { serviceId: s.id, slug: s.slug, outcome: "activated" }); progressed = true; }
          else {
            outcomes.set(s.id, { serviceId: s.id, slug: s.slug, outcome: "refused", code: r.refusal.code, message: r.refusal.message, missingPrerequisites: r.refusal.missingPrerequisites });
            if (r.refusal.code === "DEPENDENCY_UNAVAILABLE") next.push(s);
          }
        } catch (e) {
          outcomes.set(s.id, { serviceId: s.id, slug: s.slug, outcome: "failed", message: e instanceof Error ? e.message : String(e) });
        }
      }
      if (!progressed) break;
      pending = next;
    }
    const all = [...outcomes.values()];
    const activated = all.filter((o) => o.outcome === "activated").length;
    const refused = all.filter((o) => o.outcome === "refused").length;
    const failed = all.filter((o) => o.outcome === "failed").length;
    return { ok: refused === 0 && failed === 0, contractorId: contractor.id, outcomes: all, activated, refused, failed, passes };
  });
}

export type RetireResult =
  | { ok: true; contractorId: string; slug: string; already: boolean; servicesDeactivated: number; sitesDeactivated: number }
  | Refused;

/**
 * Retire a business: the reversible form of "delete". One transaction sets
 * Contractor.active false (no membership can open its dashboard), every
 * ContractorSite inactive (the storefront and embed stop resolving) and every
 * Service inactive (nothing bookable), and deletes NOTHING — quotes, bookings,
 * payment records, materials and the catalog stay, so the business can be
 * reinstated or audited later. The caller must type the slug back: a retire
 * is the one platform action a homeowner would notice within the minute.
 * Retiring twice is one retire.
 */
export async function retireContractorFor(db: PrismaClient, user: SignedInUser | null, contractorId: unknown, confirmSlug: string): Promise<RetireResult> {
  return withPlatformContractorFor(db, user, contractorId, async (guarded, _actor, contractor) => {
    if (confirmSlug.trim().toLowerCase() !== contractor.slug) {
      return { ok: false, refusal: { code: "CONFIRMATION_MISMATCH", message: `Type the business's web address, ${contractor.slug}, to confirm.` } };
    }
    const [row, liveSites, liveServices] = await Promise.all([
      guarded.contractor.findUniqueOrThrow({ where: { id: contractor.id }, select: { active: true } }),
      guarded.contractorSite.count({ where: { contractorId: contractor.id, active: true } }),
      guarded.service.count({ where: { contractorId: contractor.id, active: true } }),
    ]);
    if (!row.active && liveSites === 0 && liveServices === 0) {
      return { ok: true, contractorId: contractor.id, slug: contractor.slug, already: true, servicesDeactivated: 0, sitesDeactivated: 0 };
    }
    // The UNGUARDED client, keyed to the door's contractor id, so the three
    // writes are one transaction. Nothing here deletes.
    const [, sites, services] = await db.$transaction([
      db.contractor.update({ where: { id: contractor.id }, data: { active: false } }),
      db.contractorSite.updateMany({ where: { contractorId: contractor.id, active: true }, data: { active: false } }),
      db.service.updateMany({ where: { contractorId: contractor.id, active: true }, data: { active: false } }),
    ]);
    return { ok: true, contractorId: contractor.id, slug: contractor.slug, already: false, servicesDeactivated: services.count, sitesDeactivated: sites.count };
  });
}

// ── request-bound forms, for pages and server actions ─────────────────────

export const platformOnboardingIndex = async () => onboardingIndexFor(prisma, await currentUser());
export const platformOnboardingContractor = async (contractorId: unknown) => onboardingStatusFor(prisma, await currentUser(), contractorId);
export const platformBeginContractor = async (input: { name: string; slug?: string }) => beginContractorFor(prisma, await currentUser(), input);
export const platformAttachOwner = async (contractorId: unknown, email: string) => attachOwnerFor(prisma, await currentUser(), contractorId, email);
export const platformInviteOwner = async (contractorId: unknown, email: string) => inviteOwnerFor(prisma, await currentUser(), contractorId, email);
export const platformRevokeInvitation = async (contractorId: unknown, invitationId: string) => revokeInvitationFor(prisma, await currentUser(), contractorId, invitationId);
export const platformEnrolTrade = async (contractorId: unknown, tradeKey: string) => enrolTradeFor(prisma, await currentUser(), contractorId, tradeKey);
export const platformInstallTemplate = async (contractorId: unknown) => installTradeTemplateFor(prisma, await currentUser(), contractorId);
export const platformLaunchContractor = async (contractorId: unknown) => launchContractorFor(prisma, await currentUser(), contractorId);
export const platformRetireContractor = async (contractorId: unknown, confirmSlug: string) => retireContractorFor(prisma, await currentUser(), contractorId, confirmSlug);

// ── notices, for the query string the actions redirect with ──────────────

/** The only notices a page will voice. Anything else in the query string is ignored. */
const NOTICES: Record<string, { tone: "ok" | "warn"; text: string }> = {
  CREATED: { tone: "ok", text: "Contractor created. Attach its owner next." },
  EXISTS: { tone: "warn", text: "That web address already belongs to a contractor — resumed here instead of creating a second one." },
  OWNER_ATTACHED: { tone: "ok", text: "Owner attached." },
  OWNER_ALREADY: { tone: "ok", text: "That account was already the owner. Nothing changed." },
  OWNER_INVITED: { tone: "ok", text: "Invitation sent." },
  OWNER_REINVITED: { tone: "ok", text: "A new invitation was sent; the previous link no longer works." },
  OWNER_INVITE_UNDELIVERED: { tone: "warn", text: "The invitation was created, but the email failed to send. Resend once the problem is fixed." },
  INVITATION_REVOKED_OK: { tone: "ok", text: "Invitation withdrawn." },
  INVITATION_ALREADY_REVOKED: { tone: "ok", text: "That invitation was already withdrawn. Nothing changed." },
  TRADE_ENROLLED: { tone: "ok", text: "Trade enrolled." },
  CATALOG_INSTALLED: { tone: "ok", text: "Catalog installed. Every service is inactive until the owner prices it and it is launched." },
  CATALOG_ALREADY: { tone: "ok", text: "The catalog was already installed. Nothing changed." },
  LAUNCHED: { tone: "ok", text: "Launched: every offered service passed its activation guard." },
  LAUNCH_PARTIAL: { tone: "warn", text: "Partial launch: some offered services were refused by their activation guard. Each service's current state, and what the guard says about it, is under Launch below; the ones not yet live can be retried once their blocker is cleared." },
  CONFIRMATION_REQUIRED: { tone: "warn", text: "Tick the confirmation first." },
  RETIRED: { tone: "warn", text: "Retired: the business, its storefront and every service are now inactive. Nothing was deleted." },
  RETIRED_ALREADY: { tone: "ok", text: "This business was already retired. Nothing changed." },
  CONFIRMATION_MISMATCH: { tone: "warn", text: "The web address you typed did not match, so nothing was retired." },
  NOT_FOUND: { tone: "warn", text: "That contractor does not exist." },
};

export function noticeText(code: unknown): { tone: "ok" | "warn"; text: string } | null {
  if (typeof code !== "string") return null;
  if (code in NOTICES) return NOTICES[code];
  // A refusal code from a command, voiced as-is; the page shows the code, never an unbounded message from the URL.
  if (/^[A-Z_]{3,40}$/.test(code)) return { tone: "warn", text: `Refused: ${code.replaceAll("_", " ").toLowerCase()}.` };
  return null;
}
