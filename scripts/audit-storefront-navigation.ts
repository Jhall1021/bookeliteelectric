/**
 * No internal storefront navigation may target a root-owned path — ADR §2.2.
 *
 *   npx tsx scripts/audit-storefront-navigation.ts
 *
 * WHY THIS EXISTS
 *
 * After the storefront moved under /[site], twenty-two internal navigations
 * still pointed at root paths — `/services`, `/my-visit`, `/checkout/...`.
 * Every one of them WORKED, and that is precisely the problem: the legacy
 * redirects catch a root path and 307 it to /elite-electric. So the entire
 * client navigation layer was resting on compatibility redirects that exist
 * only for old external links.
 *
 * Nothing failed, no test caught it, and the storefront would have stopped
 * navigating the day those redirects were removed.
 *
 * THE DISTINCTION THIS ENFORCES
 *
 * The legacy redirects STAY. They are correct, and they serve bookmarks, old
 * links and search results pointing at the former Elite URLs. What must not
 * happen is the application CONSUMING them for its own navigation.
 *
 * WHY IT CHECKS EIGHT FORMS
 *
 * The first fix covered <Link href> in the header and footer, and that felt
 * complete. It missed router.push, hrefs inside page bodies, and every flow
 * component. Covering one form and calling it done is how twenty-two survived
 * the first pass.
 *
 * `app/admin/**` is excluded: /admin is genuinely root-owned.
 */

import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/** Path segments that belong to a storefront rather than to the platform. */
const STOREFRONT = "(services|my-visit|checkout|quote|troubleshooting|service-area|how-it-works|why-elite)";

const FORMS: [string, RegExp][] = [
  ["router.push", new RegExp(`router\\.push\\(\\s*[\`"']/${STOREFRONT}`)],
  ["router.replace", new RegExp(`router\\.replace\\(\\s*[\`"']/${STOREFRONT}`)],
  ["Link href", new RegExp(`<Link[^>]*href=\\{?\\s*[\`"']/${STOREFRONT}`)],
  ["a href", new RegExp(`<a[^>]*href=\\{?\\s*[\`"']/${STOREFRONT}`)],
  ["window.location", new RegExp(`window\\.location(?:\\.href)?\\s*=\\s*[\`"']/${STOREFRONT}`)],
  ["location.assign", new RegExp(`location\\.(?:assign|replace)\\(\\s*[\`"']/${STOREFRONT}`)],
  ["redirect()", new RegExp(`\\bredirect\\(\\s*[\`"']/${STOREFRONT}`)],
  ["NextResponse.redirect", new RegExp(`NextResponse\\.redirect\\(\\s*[\`"']/${STOREFRONT}`)],
];

/** Expressions that prove the navigation is already site-scoped. */
const SCOPED = ["${base}", "params.site", "hostedSlug"];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !/ \d+\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

function main() {
  const files = ["app", "components", "lib"]
    .flatMap((d) => walk(d))
    .filter((f) => !f.startsWith("app/admin"));

  const findings: { file: string; line: number; form: string; text: string }[] = [];
  for (const file of files) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((raw, i) => {
        const t = raw.trimStart();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        const code = raw.split("//")[0];
        if (SCOPED.some((s) => code.includes(s))) return;
        for (const [form, re] of FORMS) {
          if (re.test(code)) findings.push({ file, line: i + 1, form, text: code.trim() });
        }
      });
  }

  console.log(`\nSTOREFRONT NAVIGATION — ADR §2.2\n`);
  console.log(`  ${files.length} files, ${FORMS.length} navigation forms\n`);
  for (const f of findings) {
    console.log(`  !! ${f.file}:${f.line}  [${f.form}]`);
    console.log(`       ${f.text.slice(0, 96)}`);
  }
  console.log(
    findings.length === 0
      ? `  0 internal navigations target a root-owned path.\n\n` +
          `  The legacy redirects remain, and should: they serve bookmarks and old\n` +
          `  links. The application simply no longer depends on them.\n`
      : `\n  ${findings.length} internal navigation(s) target a root-owned path.\n\n` +
          `  These work only because the legacy redirects catch them, and will\n` +
          `  break when those are removed. Build the path from the site slug —\n` +
          `  useStorefrontBase() in a client component, params.site in a server one.\n`
  );
  process.exitCode = findings.length === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
