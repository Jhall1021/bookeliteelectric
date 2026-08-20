/**
 * Tidy up service names in the database.
 *
 *   npx tsx scripts/cleanup-service-data.ts            # dry run, changes nothing
 *   npx tsx scripts/cleanup-service-data.ts --apply    # actually writes
 *
 * Dry run by default on purpose: this writes to whatever DATABASE_URL points
 * at, which is production. Read the dry-run output before applying.
 *
 * Everything intentional lives in RENAMES below — edit that, re-run the dry
 * run, then apply. Whitespace trimming is automatic because a trailing space
 * is never deliberate.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * slug -> the name it should have.
 *
 * Add or change entries here rather than editing services one at a time in
 * the admin panel. Anything not listed keeps its current name (though it
 * still gets whitespace-trimmed).
 */
const RENAMES: Record<string, string> = {
  // Was: "Professional TV Installation Includes Outlet and Running Owner
  // Supplied Low Voltage Cables" — that's a description in the name field.
  // At ~90 characters it wraps to three or four lines in the service grids
  // and breaks the card alignment. The detail it carried belongs in
  // shortDescription; the dry run prints the current description so you can
  // see whether it's already covered there.
  "tv-installation": "Professional TV Installation",

  // Was lowercase where every other service is Title Case.
  "remove-and-replace-existing-chandelier": "Remove and Replace Existing Chandelier",

  // ---------------------------------------------------------------------
  // NOT SET, ON PURPOSE — two services are both called "Garage Door Opener
  // Outlet". They sit in different categories (New Outlets and EV & Garage)
  // and one has a 2-question tree while the other has none, but a customer
  // sees two identical entries with no way to tell them apart.
  //
  // Deciding what each one IS isn't something this script should guess at.
  // If they're genuinely the same job cross-listed in two categories, one
  // should probably be deleted rather than renamed. If they differ, name the
  // difference. Uncomment and edit once you've decided:
  //
  // "garage-door-opener-outlet": "Garage Door Opener Outlet",
  // "garage-door-opener-outlet-ev": "Garage Door Opener Outlet — EV Garage",
  // ---------------------------------------------------------------------
};

async function main() {
  const apply = process.argv.includes("--apply");

  const services = await prisma.service.findMany({
    orderBy: { slug: "asc" },
    select: { id: true, slug: true, name: true, shortDescription: true },
  });

  type Change = { slug: string; from: string; to: string; why: string };
  const changes: Change[] = [];

  for (const s of services) {
    let target = RENAMES[s.slug] ?? s.name;
    const why: string[] = [];
    if (RENAMES[s.slug] && RENAMES[s.slug] !== s.name) why.push("rename");

    const trimmed = target.replace(/\s+/g, " ").trim();
    if (trimmed !== target) why.push("whitespace");
    target = trimmed;

    if (target !== s.name) {
      if (s.name.trim() !== s.name) why.push("whitespace");
      changes.push({
        slug: s.slug,
        from: s.name,
        to: target,
        why: [...new Set(why)].join(" + ") || "whitespace",
      });
    }
  }

  console.log(`\n${services.length} services checked.\n`);

  if (changes.length === 0) {
    console.log("Nothing to change.\n");
  } else {
    console.log(`${changes.length} name(s) to update:\n`);
    for (const c of changes) {
      console.log(`  ${c.slug}   [${c.why}]`);
      console.log(`    from: "${c.from}"`);
      console.log(`      to: "${c.to}"`);
      const svc = services.find((s) => s.slug === c.slug);
      if (c.why.includes("rename") && svc) {
        console.log(`    current description: ${svc.shortDescription ?? "(none)"}`);
      }
      console.log();
    }
  }

  // Report duplicates rather than touching them — merging or renaming is a
  // judgement call about what the services actually are.
  const byName = new Map<string, string[]>();
  for (const s of services) {
    const key = (RENAMES[s.slug] ?? s.name).replace(/\s+/g, " ").trim().toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), s.slug]);
  }
  const dupes = [...byName.entries()].filter(([, slugs]) => slugs.length > 1);
  if (dupes.length > 0) {
    console.log(`${"-".repeat(60)}`);
    console.log(`Duplicate display names (not changed — decide in RENAMES):\n`);
    for (const [name, slugs] of dupes) {
      console.log(`  "${name}"`);
      for (const slug of slugs) console.log(`     ${slug}`);
      console.log();
    }
  }

  if (!apply) {
    console.log(`${"-".repeat(60)}`);
    console.log(`DRY RUN — nothing written. Re-run with --apply to write.\n`);
    return;
  }

  if (changes.length === 0) return;

  await prisma.$transaction(
    changes.map((c) =>
      prisma.service.update({ where: { slug: c.slug }, data: { name: c.to } })
    )
  );
  console.log(`${"-".repeat(60)}`);
  console.log(`Applied ${changes.length} update(s).\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
