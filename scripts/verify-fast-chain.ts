/**
 * `verify:fast` is exactly the database-free half of `verify`, and stays that way.
 *
 * WHY THIS EXISTS. DEVELOPMENT RELEASE MODE runs `verify:fast` on every build,
 * including Preview, where there is deliberately no DATABASE_URL. That makes
 * the fast chain the only verification standing between a branch and
 * production, so the failure that matters is not a check going red — it is a
 * check quietly never being added. A verifier written next month, added to
 * `verify` and forgotten here would simply never run on a deployment, and
 * nothing would say so. That is the same registration gap PR #7 closed for the
 * price-writer audit, and it is worth closing once rather than remembering.
 *
 * THE RULE IS DERIVED, NOT LISTED. There is no allowlist to maintain here,
 * because an allowlist is another thing to forget. Membership is computed:
 * a step belongs in `verify:fast` if and only if it is in `verify` and does not
 * touch a live database. Whether it touches one is read from the file itself.
 *
 * So the four assertions below are one idea from four sides — the two chains
 * agree, in both directions, on content and on order.
 *
 * WHAT THIS DOES NOT CLAIM. Passing says a database-free check is REGISTERED,
 * not that the fast chain is sufficient. It is not: 37 database-backed checks
 * stop gating deployments in development mode, and only `npm run verify:full`
 * restores them. That trade is recorded in docs/design/development-release-mode.md
 * along with the trigger for reversing it.
 */
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** This file itself: it guards the chain, so it is not a member of the set it checks. */
const SELF = "scripts/verify-fast-chain.ts";

const steps = (chain: string): string[] =>
  [...chain.matchAll(/tsx (scripts\/[a-z0-9-]+\.ts)/g)].map((m) => m[1]);

/**
 * Does this step need a live database?
 *
 * Read from the source rather than declared, so a verifier that GAINS a Prisma
 * import later is reclassified by the next run instead of staying misfiled.
 * The same test classified all 60 current steps, and every one of the 23 it
 * called database-free was then run with DATABASE_URL unset and passed.
 */
const needsDatabase = (file: string): boolean => {
  if (!existsSync(file)) return false;
  const src = readFileSync(file, "utf8");
  return /new PrismaClient|from "@prisma\/client"|@\/lib\/(db|prisma)|process\.env\.DATABASE_URL/.test(src);
};

function main() {
  console.log("\nFAST CHAIN");

  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts: Record<string, string>;
  };
  const full = steps(pkg.scripts.verify ?? "");
  const fast = steps(pkg.scripts["verify:fast"] ?? "");
  const fastMembers = fast.filter((s) => s !== SELF);

  console.log(`\n  MEMBERSHIP — ${full.length} in verify, ${fast.length} in verify:fast`);

  const missing = full.filter((s) => !needsDatabase(s) && !fast.includes(s));
  ok(missing.length === 0,
     "every database-free step of verify is in verify:fast",
     `not registered: ${missing.join(", ")}`);

  const foreign = fastMembers.filter((s) => !full.includes(s));
  ok(foreign.length === 0,
     "and verify:fast introduces nothing that verify does not run",
     `only in verify:fast: ${foreign.join(", ")}`);

  const wrong = fastMembers.filter(needsDatabase);
  ok(wrong.length === 0,
     "no step in verify:fast needs a live database",
     `would fail on Preview, where DATABASE_URL is absent: ${wrong.join(", ")}`);

  // Order matters only for reading the two chains side by side, but a chain
  // that drifts out of order is a chain someone has edited without looking.
  const expected = full.filter((s) => !needsDatabase(s));
  ok(JSON.stringify(expected) === JSON.stringify(fastMembers),
     "and it runs them in the order verify does",
     `expected ${expected.join(" ")}\n         got      ${fastMembers.join(" ")}`);

  console.log("\n  WIRING");
  ok((pkg.scripts["verify:full"] ?? "").trim() === "npm run verify",
     "verify:full is an alias for the comprehensive chain, not a copy of it",
     `verify:full = ${pkg.scripts["verify:full"]}`);
  ok(/npm run verify:fast/.test(pkg.scripts.build ?? ""),
     "the ordinary build runs the fast chain",
     `build = ${pkg.scripts.build}`);
  ok(!/npm run verify(?!:)/.test(pkg.scripts.build ?? ""),
     "and does not run the database-backed chain, which Preview cannot satisfy",
     `build = ${pkg.scripts.build}`);

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
