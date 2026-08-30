/**
 * Production write freeze — ADR-013 Phase 4.
 *
 * A cutover copies the database and then points production at the copy. Any
 * write that lands in the source between the copy and the switch is lost
 * silently: it exists in the old database, is absent from the new one, and
 * nothing ever reports it. "Probably nobody wrote anything during the copy" is
 * not a migration plan.
 *
 * So writes are refused for the length of the window, and the refusal is
 * proven before anything is copied.
 *
 * WHY AN ENVIRONMENT VARIABLE AND NOT A DATABASE FLAG
 *
 * A flag stored in the database would be copied into the destination, so the
 * fresh copy would arrive frozen and need unfreezing in a database nobody has
 * cut over to yet. It would also need a cached read on every query, and a
 * cache is a way for a freeze to be briefly untrue. An env var is read from
 * the process, costs nothing, cannot be copied by accident, and is exactly as
 * atomic as the deployment that carries it.
 *
 * The cost is that toggling it takes a redeploy. The cutover redeploys anyway.
 *
 * WHY THE BASE CLIENT
 *
 * This wraps the client in lib/prisma.ts, which every other client derives
 * from — including the tenant-guarded one and any interactive transaction.
 * Nested writes still bypass Prisma's extension mechanism (ADR-007), but a
 * nested write only ever runs beneath a top-level write, and the top-level one
 * is refused. Raw SQL is intercepted separately below.
 *
 * NOT a Postgres permission change and not a database lock: the instruction
 * was explicit, and either would put the source database into a state that a
 * rollback would then have to undo.
 */
import { Prisma } from "@prisma/client";

/** Thrown by any attempted mutation while the freeze is on. */
export class WriteFrozenError extends Error {
  readonly code = "WRITE_FROZEN";
  constructor(detail: string) {
    super(
      `Writes are frozen for a planned database migration. ${detail} ` +
        `Reads are unaffected. This is deliberate and short.`
    );
    this.name = "WriteFrozenError";
  }
}

/** Every Prisma model operation that changes data. */
const MUTATING = new Set([
  "create", "createMany", "createManyAndReturn",
  "update", "updateMany", "updateManyAndReturn",
  "upsert", "delete", "deleteMany",
]);

/**
 * On, only when the variable is exactly "1" or "true".
 *
 * Deliberately strict: a typo'd value must fail OPEN rather than freeze
 * production by accident. The freeze is proven before it is relied on, so an
 * accidentally-off freeze is caught by the proof; an accidentally-ON freeze
 * would be an outage nobody asked for.
 */
export function writesAreFrozen(): boolean {
  const v = (process.env.WRITE_FREEZE ?? "").trim().toLowerCase();
  return v === "1" || v === "true";
}

export const writeFreezeExtension = Prisma.defineExtension({
  name: "write-freeze",
  query: {
    $allModels: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async $allOperations({ model, operation, args, query }: any) {
        if (MUTATING.has(operation) && writesAreFrozen()) {
          throw new WriteFrozenError(`Refused ${model}.${operation}.`);
        }
        return query(args);
      },
    },
    // Raw SQL does not pass through $allModels, so it is intercepted here.
    // $queryRaw is left alone — it is how the verifiers read the catalog,
    // and reading is the half of the system that stays up.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $executeRaw({ args, query }: any) {
      if (writesAreFrozen()) throw new WriteFrozenError("Refused $executeRaw.");
      return query(args);
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async $executeRawUnsafe({ args, query }: any) {
      if (writesAreFrozen()) throw new WriteFrozenError("Refused $executeRawUnsafe.");
      return query(args);
    },
  },
});
