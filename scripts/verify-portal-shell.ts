/**
 * The contractor portal stays what it says it is.
 *
 * Price2Book's sharpest asset is a narrow product boundary — pricing and
 * booking, sitting between the homeowner and the software the contractor
 * already runs. A dashboard is exactly where that erodes: one plausible tile
 * at a time, each defensible on its own, until it is a worse CRM.
 *
 * So the boundary is asserted rather than remembered, alongside the two
 * tenancy properties the shell must never lose.
 *
 * Static. No database. Runs in the deploy gate.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { PORTAL_MODULES, PORTAL_GROUPS, OUT_OF_SCOPE } from "../lib/portalModules";
import { RESERVED_HOSTED_SLUGS } from "../lib/siteRouting";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

function boundary() {
  console.log("\n  THE PRODUCT BOUNDARY");
  const names = PORTAL_MODULES.map((m) => m.name);
  const strayed = OUT_OF_SCOPE.filter((o) =>
    names.some((n) => n.toLowerCase().includes(o.split(" ")[0].toLowerCase())));
  ok(strayed.length === 0, `no module strays into ${OUT_OF_SCOPE.length} out-of-scope areas`,
    `found: ${strayed.join(", ")}`);

  // The approved product names, spelled as the handoff spells them.
  for (const n of ["Guided Pricing", "Services & Pricing", "Hours & Availability",
                   "Service Area", "Crew Eligibility", "Integrations", "Photo Review"]) {
    ok(names.includes(n), `"${n}" is offered under its approved name`);
  }

  ok(PORTAL_MODULES.every((m) => PORTAL_GROUPS.some((g) => g.key === m.group)),
    "every module belongs to a named group");
  ok(PORTAL_MODULES.every((m) => m.href.startsWith("/dashboard/")),
    "every module lives under /dashboard",
    PORTAL_MODULES.filter((m) => !m.href.startsWith("/dashboard/")).map((m) => m.href).join(", "));

  // The dashboard has to SAY the boundary, not merely respect it.
  // Whitespace-normalised: JSX copy wraps, and a sentence split across two
  // source lines is the same sentence to a reader.
  const page = readFileSync("app/dashboard/page.tsx", "utf8").replace(/\s+/g, " ");
  ok(/traces back to something you control/.test(page),
    "the overview states the control-panel headline");
  ok(/Customers, invoices, payroll, dispatch and reporting/.test(page),
    "…and names what stays in the contractor's existing software");
}

function tenancy() {
  console.log("\n  THE TENANT BOUNDARY");
  const ctx = readFileSync("lib/adminContext.ts", "utf8");
  ok(/AmbiguousContractorError/.test(ctx) && /usable\.length > 1/.test(ctx),
    "more than one membership is ambiguous, never a silently chosen first row");
  ok(!/usable\[0\]\s*;?\s*$/m.test(ctx.replace(/const only = usable\[0\];/, "")),
    "the only unconditional first-row read is the single-membership case");

  // The selection cookie must be re-validated, never trusted.
  ok(/chosenId \?\? |contractorId \?\? cookies\(\)/.test(ctx),
    "the selection cookie feeds the same membership check as an explicit id");
  const route = readFileSync("app/api/portal/contractor/route.ts", "utf8");
  ok(/resolveAdminContractor\(contractorId\)/.test(route),
    "choosing a contractor validates membership before storing anything");

  const layout = readFileSync("app/dashboard/layout.tsx", "utf8");
  ok(/resolveAdminContractor\(\)/.test(layout) && /redirect\("\/sign-in"\)/.test(layout),
    "the portal layout gates on membership, not merely on being signed in");
  ok(/redirect\("\/choose"\)/.test(layout),
    "…and sends an ambiguous account to choose rather than picking for them");
  ok(!existsSync("app/dashboard/choose"),
    "the chooser is not under the layout that redirects to it");
}

function vocabulary() {
  console.log("\n  CONTRACTOR-FACING VOCABULARY");
  // Everything left under app/admin must be a redirect. A real page there
  // would be a second front door with none of the portal's chrome.
  const walk = (d: string): string[] =>
    !existsSync(d) ? [] : readdirSync(d).flatMap((f) => {
      const p = `${d}/${f}`;
      return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
    });
  const adminFiles = walk("app/admin");
  const notRedirects = adminFiles.filter((f) => !/redirect\(/.test(readFileSync(f, "utf8")));
  ok(notRedirects.length === 0,
    `everything under app/admin is a compatibility redirect (${adminFiles.length} files)`,
    notRedirects.join(", "));

  // No customer- or contractor-facing link may point at the old vocabulary.
  // `ls-files -co` also lists tracked files that have been DELETED, so the
  // existence check is not defensive padding — AdminNav was removed in this
  // same change and reading it threw.
  const files = execSync("git ls-files -co --exclude-standard 'app' 'components'", { encoding: "utf8" })
    .split("\n").filter((f) => /\.tsx?$/.test(f) && existsSync(f)
      && !f.startsWith("app/admin/") && !f.startsWith("app/api/admin/"));
  const stale: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\*|\/\*|\/\/)/.test(line)) return;
      if (/["'`]\/admin\//.test(line)) stale.push(`${f}:${i + 1}  ${line.trim().slice(0, 80)}`);
    });
  }
  ok(stale.length === 0, `no live link points into /admin (${files.length} files)`, stale.slice(0, 5).join("\n         "));

  // A contractor taking one of these as a storefront slug would shadow the portal.
  for (const s of ["dashboard", "sign-in", "choose", "portal", "onboarding"]) {
    ok(RESERVED_HOSTED_SLUGS.has(s), `"${s}" is reserved against storefront slugs`);
  }
}

function branding() {
  console.log("\n  PRICE2BOOK'S SURFACE, NOT THE CONTRACTOR'S");
  const chrome = readFileSync("components/portal/PortalChrome.tsx", "utf8");
  ok(/Price2Book/.test(chrome), "the portal wears the platform's name");
  // The portal must not adopt the contractor's chosen storefront theme: whose
  // software this is should never be ambiguous on the screen where a
  // contractor decides what their customers will see.
  ok(!/useStructure|ThemeStructureProvider|resolveStorefrontTheme/.test(chrome),
    "…and does not adopt the contractor's storefront theme");
  ok(/contractorName/.test(chrome),
    "but always shows WHICH contractor is being acted for");
}

function main() {
  console.log("\nPORTAL SHELL");
  boundary();
  tenancy();
  vocabulary();
  branding();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
