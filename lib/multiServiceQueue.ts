/**
 * A queue of services the customer wants on one visit.
 *
 * WHY A QUEUE AND NOT A BULK ADD
 *
 * The service finder can now recognize two or three jobs in one sentence. It
 * cannot add them to the visit, because most services have a question tree
 * and POST /api/visit needs an answer snapshot — a bedroom outlet and an
 * ethernet run both ask where the wiring goes. So "continue with both" means
 * walking the customer through each guided flow in turn, not writing two rows.
 *
 * This holds the remainder while they do that.
 *
 * SAME DISCIPLINE AS THE REROUTE HANDOFF
 *
 * RerouteNotice already carries answers across a service navigation through
 * sessionStorage, and this follows it deliberately rather than inventing a
 * second mechanism: session-scoped so it dies with the tab, validated against
 * the service actually being viewed, and never trusted just because it's
 * there.
 *
 * Two guards against a stale queue leaking into an unrelated flow later:
 *
 *   - it only advances when the service just added is IN the queue, so
 *     wandering off to some other service ignores it entirely
 *   - it expires, because a customer who abandons this halfway and comes back
 *     after lunch should not be pushed into a flow they've forgotten about
 */

export const MULTI_SERVICE_QUEUE_KEY = "bee.multiServiceQueue";

/** Long enough to finish two or three flows, short enough to be forgotten. */
const TTL_MS = 30 * 60 * 1000;

export type QueuedService = {
  slug: string;
  categorySlug: string;
  name: string;
};

type Payload = {
  createdAt: number;
  /** What the customer originally typed. Kept for the header on the flow. */
  origin: string;
  services: QueuedService[];
};

function read(): Payload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(MULTI_SERVICE_QUEUE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw) as Payload;
    if (
      !payload ||
      typeof payload.createdAt !== "number" ||
      !Array.isArray(payload.services)
    ) {
      clearQueue();
      return null;
    }
    if (Date.now() - payload.createdAt > TTL_MS) {
      clearQueue();
      return null;
    }
    return payload;
  } catch {
    clearQueue();
    return null;
  }
}

function write(payload: Payload): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(MULTI_SERVICE_QUEUE_KEY, JSON.stringify(payload));
  } catch {
    // Private browsing, quota, a locked-down browser. The customer just gets
    // the ordinary one-service-at-a-time path — worth nothing breaking over.
  }
}

export function clearQueue(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(MULTI_SERVICE_QUEUE_KEY);
  } catch {
    /* nothing to do */
  }
}

/** Start a run. Replaces anything already queued. */
export function startQueue(services: QueuedService[], origin: string): void {
  if (services.length === 0) return clearQueue();
  write({ createdAt: Date.now(), origin, services });
}

/** Everything still waiting, including the one being worked on. */
export function peekQueue(): QueuedService[] {
  return read()?.services ?? [];
}

/** What the customer typed to start this run, if a run is active. */
export function queueOrigin(): string | null {
  return read()?.origin ?? null;
}

/**
 * Mark the service just added as done and return whatever is next.
 *
 * Returns null when the run is finished OR when `justAddedSlug` isn't part of
 * a run at all — the ordinary case of someone adding a single service, which
 * must keep behaving exactly as it did.
 */
export function advanceQueue(justAddedSlug: string): QueuedService | null {
  const payload = read();
  if (!payload) return null;

  const index = payload.services.findIndex((s) => s.slug === justAddedSlug);
  // Not part of this run. Leave the queue alone rather than consuming
  // someone else's place in it.
  if (index === -1) return null;

  const remaining = payload.services.filter((_, i) => i !== index);
  if (remaining.length === 0) {
    clearQueue();
    return null;
  }

  write({ ...payload, services: remaining });
  return remaining[0];
}

/** Where a queued service lives. */
/**
 * Where to send the customer for the next queued service.
 *
 * `base` IS REQUIRED, and that is the whole point of the signature. This
 * returned a bare "/services/..." with no storefront segment, so on any
 * hosted storefront the next service in a multi-service run resolved against
 * whichever contractor the root happens to serve. A homeowner partway through
 * booking with one electrician was handed another one's catalog.
 *
 * Making it a parameter rather than a convention means the compiler asks the
 * question at every call site. Pass "" only for a single-tenant root.
 */
export function queuedServiceHref(s: QueuedService, base: string): string {
  return `${base}/services/${s.categorySlug}/${s.slug}`;
}
