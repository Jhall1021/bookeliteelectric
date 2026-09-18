/** Runs the real seed body with an in-memory Prisma test double; no DB or network. */
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

async function run(source: string) {
  const writes: string[] = [];
  const canonical = new Map<string, { id: string }>();
  const policies = new Map<string, { id: string; text: string; notes: string }>();
  policies.set("CUSTOMER_SUPPLIED_EQUIPMENT", { id: "shared-policy", text: "Preserved policy wording", notes: "Preserved notes" });
  const original = JSON.stringify(policies.get("CUSTOMER_SUPPLIED_EQUIPMENT"));
  let complete!: () => void;
  const done = new Promise<void>((resolve) => { complete = resolve; });
  let error: unknown;
  const prisma = {
    canonicalDisclaimer: {
      upsert: async ({ where }: any) => { const row = { id: where.key }; canonical.set(where.key, row); return row; },
      findUniqueOrThrow: async ({ where }: any) => canonical.get(where.key),
    },
    contractorDisclaimer: {
      upsert: async ({ where, update, create }: any) => {
        const key = where.contractorId_canonicalDisclaimerId.canonicalDisclaimerId;
        const row = policies.get(key) ?? { ...create, id: key };
        if (policies.has(key)) Object.assign(row, update);
        policies.set(key, row); return row;
      },
      findUnique: async ({ where }: any) => policies.get(where.contractorId_canonicalDisclaimerId.canonicalDisclaimerId),
    },
    conditionalDisclaimer: { upsert: async () => ({}) },
    question: { findFirst: async ({ where }: any) => {
      // Same slug/key exists under BOTH contractors; foreign row comes first.
      const owner = where.service.contractorId === "elite" ? "elite" : "other";
      return { options: ["existing_switched_light", "yes", "same_mounting"].map(value => ({ id: `${owner}:${where.service.slug}:${value}`, value })) };
    } },
    answerOption: { update: async ({ where }: any) => { writes.push(where.id); } },
    answerOptionDisclaimer: { upsert: async ({ create }: any) => { writes.push(create.answerOptionId); } },
    service: { findUnique: async () => null },
    $disconnect: async () => { complete(); },
  };
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports: {}, console: { log() {}, error(e: unknown) { error = e; } },
    process: { exit(code: number) { error = new Error(`seed exit ${code}`); } },
    require(name: string) {
      if (name === "@prisma/client") return { PrismaClient: function () { return prisma; } };
      if (name === "./_componentHelpers") return { eliteContractorId: async () => "elite" };
      if (name === "./_serviceKey") return { serviceSlugKey: async (_: unknown, slug: string) => ({ contractorId_slug: { contractorId: "elite", slug } }) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  await done;
  if (error) throw error;
  return { writes, policyPreserved: original === JSON.stringify(policies.get("CUSTOMER_SUPPLIED_EQUIPMENT")) };
}

async function main() {
  const source = fs.readFileSync("prisma/seed-conditional-disclaimers.ts", "utf8");
  const fixed = await run(source);
  assert.equal(fixed.writes.length, 12); // Four ceiling + two equipment attachments and updates.
  assert(fixed.writes.every(id => id.startsWith("elite:")));
  assert(fixed.policyPreserved);
  const oldLookup = await run(source.replaceAll("service: { slug: a.slug, contractorId }", "service: { slug: a.slug }"));
  assert(oldLookup.writes.some(id => id.startsWith("other:")), "negative control must reproduce cross-contractor writes");
  console.log("PASS: both attachment loops stay with Elite, retained wording survives, and old lookup fails the isolation control");
}
main().catch(e => { console.error(e); process.exitCode = 1; });
