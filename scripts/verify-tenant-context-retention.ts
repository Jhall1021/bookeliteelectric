/**
 * Tenant context must outlive the callback's RETURN, not just its call.
 *
 *   npx tsx scripts/verify-tenant-context-retention.ts
 *
 * OFFLINE. No database, no fixture, no contractor — it exercises the context
 * plumbing with a deliberately lazy thenable and nothing else. That is why it
 * belongs in the gate rather than in the live harness.
 *
 * THE BUG THIS PRESERVES
 *
 * `withContractor` used to be:
 *
 *     return withTenant(ctx, () => fn(guarded));
 *
 * A Prisma promise is LAZY: `db.service.findUnique(...)` builds a query and
 * does nothing until it is awaited. Returning it unawaited let
 * AsyncLocalStorage.run() exit before the query ran, so the query executed
 * OUTSIDE the tenant context and threw NoTenantContextError.
 *
 * What made it dangerous is that the vulnerable shape is the NATURAL one. Every
 * adopted route was written as `(db) => db.thing.findMany(...)`, a one-line
 * arrow returning the promise, and the build never noticed. It was found by the
 * first genuinely cross-tenant assertion in the live harness.
 *
 * THE INVARIANT
 *
 *   Tenant context stays active until the callback's returned work has
 *   SETTLED, not merely until the callback has returned a Promise.
 *
 * Changing `async () => await fn(guarded)` back to `() => fn(guarded)` fails
 * this immediately.
 */

import { pathToFileURL } from "node:url";
import { withContractor } from "../lib/tenantRoute";
import { currentTenantOrNull } from "../lib/tenantContext";

let fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n      ${detail}`}`);
}

/**
 * A promise-like that does NOTHING until something awaits it — the shape of a
 * Prisma promise, with none of the database.
 */
function lazyThenable<T>(produce: () => T): PromiseLike<T> {
  return {
    then<R1, R2>(
      onFulfilled?: ((v: T) => R1 | PromiseLike<R1>) | null,
      onRejected?: ((e: unknown) => R2 | PromiseLike<R2>) | null
    ): PromiseLike<R1 | R2> {
      try {
        const v = produce();
        return Promise.resolve(onFulfilled ? onFulfilled(v) : (v as unknown as R1));
      } catch (e) {
        return onRejected
          ? Promise.resolve(onRejected(e))
          : (Promise.reject(e) as PromiseLike<R2>);
      }
    },
  };
}

async function main() {
  console.log(`\nTENANT CONTEXT RETENTION\n`);

  // 1. The regression itself. The callback returns a lazy thenable that only
  //    reads the context when something finally awaits it.
  {
    const seen = await withContractor(
      "contractor-under-test",
      "test",
      () => lazyThenable(() => currentTenantOrNull()?.contractorId ?? null) as Promise<string | null>
    );
    ok(
      seen === "contractor-under-test",
      "context is still active when a LAZY returned promise settles",
      `saw ${JSON.stringify(seen)} — withContractor is returning the callback's ` +
        `promise without awaiting it inside the scope`
    );
  }

  // 2. An already-awaited callback must keep working too.
  {
    const seen = await withContractor("c2", "test", async () => {
      await new Promise((r) => setTimeout(r, 1));
      return currentTenantOrNull()?.contractorId ?? null;
    });
    ok(seen === "c2", "context survives an await inside the callback", `saw ${seen}`);
  }

  // 3. Context must not leak past the call.
  {
    await withContractor("c3", "test", async () => "done");
    ok(
      currentTenantOrNull() === null,
      "and is gone once the call completes — no leakage into later work"
    );
  }

  // 4. Concurrent contexts must not see each other.
  {
    const [a, b] = await Promise.all([
      withContractor("A", "test", () =>
        lazyThenable(() => currentTenantOrNull()?.contractorId ?? null) as Promise<string | null>
      ),
      withContractor("B", "test", async () => {
        await new Promise((r) => setTimeout(r, 2));
        return currentTenantOrNull()?.contractorId ?? null;
      }),
    ]);
    ok(a === "A" && b === "B", "interleaved contexts stay separate", `got ${a} / ${b}`);
  }

  console.log(
    fail === 0
      ? `\n  Context retention holds.\n`
      : `\n  ${fail} check(s) FAILED — tenant queries can escape their context.\n`
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
