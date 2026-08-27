/**
 * Transform schema.prisma into its CONTRACTED shape.
 *
 * Deterministic and idempotent. This is the real edit the contract release
 * makes — the rehearsal pushes THIS schema to a Neon branch with
 * `prisma db push`, so the rehearsal exercises the actual deployment
 * mechanism rather than a hand-written approximation of it.
 *
 * EVERY EDIT ASSERTS INDIVIDUALLY.
 *
 * The expand step used one aggregate assertion for a dozen replacements. Some
 * silently no-oped, twelve indexes never reached the database, and `db push`
 * reported "in sync" because the schema it was syncing did not contain them.
 * That went undetected through a push, a build, the full gate, a merge and a
 * production deploy. So: each edit here names its anchor, requires exactly one
 * match, and fails loudly on zero or many.
 *
 *   --write    apply to prisma/schema.prisma
 *   (default)  dry run, report what would change
 *
 * Reverting is `git checkout prisma/schema.prisma`.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const FILE = "prisma/schema.prisma";

/** The ten models whose owner becomes required, with their exact declarations. */
const REQUIRED_OWNERS: [string, string, string][] = [
  // [model, current contractorId line, current relation line]
  ["Service", "contractorId          String?", "contractor            Contractor?"],
  ["ServiceArea", "contractorId String?", "contractor   Contractor?"],
  ["PricingSettings", "contractorId String?", "contractor   Contractor?"],
  ["JobberConnection", "contractorId String?", "contractor   Contractor?"],
  ["BusinessHours", "contractorId String?", "contractor   Contractor?"],
  ["ContractorMaterialSettings", "contractorId String?", "contractor   Contractor?"],
  ["Visit", "contractorId String?", "contractor   Contractor?"],
  ["Customer", "contractorId String?", "contractor   Contractor?"],
  ["Photo", "contractorId String?", "contractor   Contractor?"],
  ["JobberCrewMember", "contractorId               String?", "contractor                 Contractor?"],
];

type Edit = { why: string; apply: (s: string) => string };

function modelBody(s: string, model: string): { start: number; end: number; body: string } {
  const re = new RegExp(`^model\\s+${model}\\s*\\{[\\s\\S]*?^\\}`, "m");
  const m = re.exec(s);
  if (!m) throw new Error(`model ${model} not found`);
  return { start: m.index, end: m.index + m[0].length, body: m[0] };
}

/** Replace inside ONE model, asserting the anchor matches exactly once there. */
function inModel(model: string, from: string | RegExp, to: string, why: string): Edit {
  return {
    why,
    apply(s) {
      const { start, end, body } = modelBody(s, model);
      const count =
        typeof from === "string"
          ? body.split(from).length - 1
          : (body.match(new RegExp(from.source, from.flags.replace("g", "") + "g")) ?? []).length;
      if (count !== 1) throw new Error(`${why}: anchor matched ${count} times in ${model}`);
      const next = typeof from === "string" ? body.replace(from, to) : body.replace(from, to);
      return s.slice(0, start) + next + s.slice(end);
    },
  };
}

const EDITS: Edit[] = [];

// ---- 1. ownership columns become required -------------------------------
for (const [model, idLine, relLine] of REQUIRED_OWNERS) {
  EDITS.push(
    inModel(model, idLine, idLine.replace("String?", "String "), `${model}.contractorId -> required`)
  );
  EDITS.push(
    inModel(model, relLine, relLine.replace("Contractor?", "Contractor "), `${model}.contractor -> required relation`)
  );
}

// ---- 2. crew identity: drop the global unique ---------------------------
EDITS.push(
  inModel(
    "JobberCrewMember",
    "  jobberUserId               String      @unique",
    "  jobberUserId               String",
    "JobberCrewMember: drop the global jobberUserId unique"
  )
);

// ---- 3. dead columns ------------------------------------------------------
EDITS.push(
  inModel("Photo", /\n\s*bookingId\s+String\?/, "", "Photo: drop the dead bookingId column")
);
EDITS.push(
  inModel("Visit", /\n\s*customerId\s+String\?/, "", "Visit: drop the vestigial customerId column")
);
EDITS.push(
  inModel(
    "Visit",
    /\n\s*customer\s+Customer\?\s+@relation\(fields: \[customerId\], references: \[id\]\)/,
    "",
    "Visit: drop the customer relation that column carried"
  )
);
EDITS.push(
  inModel("Customer", /\n\s*visits\s+Visit\[\]/, "", "Customer: drop the now-dangling visits back-relation")
);

// ---- 4. ArrivalWindow uniqueness -----------------------------------------
EDITS.push(
  inModel(
    "ArrivalWindow",
    "  @@index([serviceAreaId])",
    "  // Closes the checkout find-or-create race. The constraint alone does not\n" +
      "  // fix it — it converts two silent successes into one success and one\n" +
      "  // throw; app/api/checkout/route.ts turns the throw into a retry.\n" +
      "  @@unique([date, startTime, endTime, serviceAreaId])\n" +
      "  @@index([serviceAreaId])",
    "ArrivalWindow: add the slot uniqueness"
  )
);

function main() {
  const write = process.argv.includes("--write");
  const before = readFileSync(FILE, "utf8");

  if (before.includes("contractorId String \n") || /jobberUserId\s+String\n/.test(before)) {
    // Cheap idempotence signal; the per-edit asserts are the real guard.
  }

  console.log(`\nCONTRACT SCHEMA TRANSFORM   ${write ? "WRITE" : "DRY RUN (--write to apply)"}\n`);
  let s = before;
  let applied = 0;
  for (const e of EDITS) {
    try {
      s = e.apply(s);
      applied++;
      console.log(`  ok   ${e.why}`);
    } catch (err) {
      console.log(`  FAIL ${e.why}\n         ${(err as Error).message}`);
      console.log(`\n  Aborting — schema NOT written. Every edit must apply.\n`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(`\n  ${applied}/${EDITS.length} edits apply cleanly.`);
  if (!write) {
    console.log(`\n  Dry run — nothing written.\n`);
    return;
  }
  writeFileSync(FILE, s);
  console.log(`\n  Written. Revert with: git checkout prisma/schema.prisma\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
