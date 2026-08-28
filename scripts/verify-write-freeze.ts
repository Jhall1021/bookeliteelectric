/**
 * The write freeze actually refuses writes — ADR-013 Phase 4.
 *
 * Run BEFORE the freeze is relied on. A freeze that is believed rather than
 * proven is worse than no freeze: the cutover would copy the database
 * confident that nothing could change underneath it.
 *
 * Proves both directions. A check that only shows writes failing would pass
 * just as well if the database were unreachable, so every refusal is paired
 * with a read that must still succeed, and with the same write succeeding
 * once the freeze is lifted.
 *
 * Runs against DATABASE_URL. Any row it creates is created only while the
 * freeze is OFF and is removed before it returns.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`    ok   ${label}`); }
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

const PROBE = "__write_freeze_probe__";

/** A fresh client per phase: the extension reads the env var at call time,
 *  but a new client makes the two phases unambiguously independent. */
async function withFreeze<T>(on: boolean, fn: (p: PrismaClient) => Promise<T>): Promise<T> {
  const before = process.env.WRITE_FREEZE;
  process.env.WRITE_FREEZE = on ? "1" : "";
  const { prisma } = await import(`../lib/prisma?freeze=${on}`);
  try { return await fn(prisma as PrismaClient); }
  finally {
    await (prisma as PrismaClient).$disconnect().catch(() => {});
    if (before === undefined) delete process.env.WRITE_FREEZE;
    else process.env.WRITE_FREEZE = before;
  }
}

const refused = (e: unknown) =>
  typeof e === "object" && e !== null && (e as { code?: string }).code === "WRITE_FROZEN";

async function main() {
  console.log("\nWRITE FREEZE\n");

  // ---- FROZEN ------------------------------------------------------------
  console.log("  WITH THE FREEZE ON");
  await withFreeze(true, async (p) => {
    for (const [label, run] of [
      ["create", () => p.contractor.create({ data: { slug: PROBE, name: "probe" } })],
      ["update", () => p.contractor.update({ where: { slug: PROBE }, data: { name: "x" } })],
      ["updateMany", () => p.pricingSettings.updateMany({ data: { targetRateCents: 1 } })],
      ["upsert", () => p.contractor.upsert({ where: { slug: PROBE }, update: {}, create: { slug: PROBE, name: "p" } })],
      ["deleteMany", () => p.visit.deleteMany({ where: { id: PROBE } })],
      ["$executeRawUnsafe", () => p.$executeRawUnsafe(`UPDATE contractors SET name = name`)],
    ] as [string, () => Promise<unknown>][]) {
      let e: unknown;
      try { await run(); } catch (err) { e = err; }
      ok(refused(e), `${label} is REFUSED`, e ? `threw ${(e as Error).name}` : "it SUCCEEDED");
    }

    // Reads must still work — otherwise "writes fail" proves only that the
    // database is unreachable.
    const n = await p.contractor.count();
    ok(n >= 1, "reads still work while frozen", `contractor count came back ${n}`);
    const s = await p.service.findFirst({ select: { id: true } });
    ok(s !== null, "and so do relational reads");
    const raw = (await p.$queryRawUnsafe(`SELECT 1 AS v`)) as { v: number }[];
    ok(raw[0].v === 1, "$queryRaw still works — only $executeRaw is blocked");
  });

  // ---- THAWED ------------------------------------------------------------
  console.log("\n  WITH THE FREEZE OFF — the same writes must succeed");
  await withFreeze(false, async (p) => {
    await p.contractor.deleteMany({ where: { slug: PROBE } });
    let created = false;
    try {
      await p.contractor.create({ data: { slug: PROBE, name: "probe" } });
      created = true;
    } catch { /* reported below */ }
    ok(created, "create SUCCEEDS once the freeze is lifted",
       "the freeze is stuck on, or something else is refusing writes");
    if (created) {
      const gone = await p.contractor.deleteMany({ where: { slug: PROBE } });
      ok(gone.count === 1, "and the probe is removed again");
    }
    const left = await p.contractor.count({ where: { slug: PROBE } });
    ok(left === 0, "no probe contractor remains");
  });

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0
    ? `\n  ${pass} checks passed. The freeze refuses writes and reads stay up.\n`
    : `\n  ${fail} of ${pass + fail} FAILED — do NOT rely on the freeze.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; });
}
