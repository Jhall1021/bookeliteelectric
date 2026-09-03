/**
 * Which contractor the current work belongs to.
 *
 * NOT WIRED INTO THE APPLICATION. `lib/prisma.ts` is untouched and every
 * existing query still runs unguarded. This is proven first, adopted after.
 *
 * WHERE THE CONTRACTOR COMES FROM
 *
 * The production customer experience is embedded on the contractor's own
 * website, so tenant identity arrives on the API call as a scoped public site
 * identifier — not from a URL path and not from a route segment. See
 * docs/decisions/PRICE2BOOK-PRODUCT-BOUNDARY-AND-EMBED-ARCHITECTURE.md §3.
 *
 * That is simpler than the earlier plan. There is no middleware rewrite and
 * no Edge/Node boundary to cross: the request handler resolves the site
 * identifier to a contractor and opens a context around its own work.
 *
 * WHY AMBIENT RATHER THAN THREADED
 *
 * The alternative is a contractorId argument on every query. There are
 * roughly two hundred query sites; missing one does not throw, it returns
 * another contractor's row. AsyncLocalStorage gives each request an isolated
 * store, so concurrent requests for different contractors cannot see each
 * other's context.
 */

import { AsyncLocalStorage } from "node:async_hooks";

export type TenantContext = {
  contractorId: string;
  /** How the contractor was identified. For logging and tests. */
  /**
   * `platform-session` is Price2Book staff entering a contractor through
   * withPlatformContractor — an authorized platform actor holding a key to
   * the tenant boundary, distinguishable in logs from the contractor's own
   * admin session.
   */
  source: "site-identifier" | "admin-session" | "platform-session" | "system" | "test";
};

const storage = new AsyncLocalStorage<TenantContext>();

export class NoTenantContextError extends Error {
  constructor(detail: string) {
    super(
      `No contractor context: ${detail}. Refusing to run a tenant-scoped ` +
        `query without knowing which contractor it belongs to.`
    );
    this.name = "NoTenantContextError";
  }
}

export class CrossTenantError extends Error {
  constructor(detail: string) {
    super(`Cross-tenant access refused: ${detail}`);
    this.name = "CrossTenantError";
  }
}

/** Run something with a contractor in scope. */
export function withTenant<T>(ctx: TenantContext, fn: () => T): T {
  if (!ctx.contractorId || typeof ctx.contractorId !== "string") {
    throw new NoTenantContextError("an empty or non-string contractorId was supplied");
  }
  return storage.run(ctx, fn);
}

/**
 * The current contractor, or throw.
 *
 * No default, no null return. A caller that forgets to open a context gets an
 * error rather than everyone's data. That is the entire point of the module:
 * the failure mode must be a crash, never a silent cross-tenant read.
 */
export function requireTenant(detail = "none was opened for this request"): TenantContext {
  const ctx = storage.getStore();
  if (!ctx) throw new NoTenantContextError(detail);
  return ctx;
}

/** The current contractor, or null. Diagnostics only. */
export function currentTenantOrNull(): TenantContext | null {
  return storage.getStore() ?? null;
}

/**
 * Run deliberately outside any tenant scope.
 *
 * Named so it is obvious in a diff and greppable in review. Platform work
 * only: seeds, migrations, listing contractors, cross-tenant reporting.
 */
export function asPlatform<T>(fn: () => T): T {
  return storage.run(undefined as unknown as TenantContext, fn);
}
