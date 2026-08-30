/**
 * The demonstration contractor used for marketing screenshots — ADR-020.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Price2Book's marketing site shows real product surfaces. Those surfaces are
 * full of a contractor's pricing, customers, bookings and addresses, so the
 * one thing a screenshot must never contain is a real tenant. Elite is a real
 * tenant. So is every contractor that follows.
 *
 * There is a second reason, and the owner named it: the homepage has to read
 * as a platform that works for contractors, not as one electrician's product
 * demo. Hero imagery carrying Elite's name would quietly make Price2Book look
 * like Elite's software.
 *
 * So: a fictional contractor, provisioned through the SHIPPED path from the
 * real electrical template, photographed, and then deleted. Everything it
 * shows is genuinely what the product does — nothing here is a mock-up — but
 * nobody's real business is in the picture.
 *
 * Every identifier below is deliberately unusable: a 555-01xx telephone number
 * (reserved for fiction) and a .example address (a reserved TLD that can never
 * resolve). No street address or license number is set at all, because the
 * identity resolver omits an incomplete one entirely rather than half-render
 * it — which is exactly the behavior we want here. Inventing a plausible
 * address and license for a business that does not exist would be fabricating
 * a record, and a screenshot is a publication.
 *
 *   npx tsx scripts/demo-contractor.ts --create
 *   npx tsx scripts/demo-contractor.ts --sign-in-url
 *   npx tsx scripts/demo-contractor.ts --destroy
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { cloneCatalog } from "./_cloneCatalog";

const prisma = new PrismaClient();

/** Whose catalog the demonstration contractor is built from. */
const SOURCE_SLUG = "elite-electric";

/**
 * The services the demo needs. Anything these route to is pulled in
 * automatically, so this lists the starting points only.
 */
const DEMO_SERVICES = [
  // The homeowner demo walks this one: seven questions, a real $280 price,
  // and the routes that decide whether it can be priced at all.
  "new-120v-outlet",
  // Same-visit work, for the While We're There step. Real services with
  // real same-visit prices, not a separate list of invented ones.
  "replace-standard-outlet",
  "replace-gfci-outlet",
  "hardwired-smoke-detector",
];

export const DEMO = {
  slug: "voltmark-electric",
  name: "Voltmark Electric",
  shortName: "Voltmark",
  phone: "(555) 010-0142",
  supportEmail: "office@voltmark.example",
  serviceAreaLabel: "Greater Riverbend",
  userEmail: "demo@voltmark.example",
  userName: "Dana Reyes",
  themeFamily: "warm-welcoming",
  themeVariant: "a",
  themeVersion: 1,
} as const;

/** A demo tenant must be trivially identifiable as one, from the row alone. */
const DEMO_MARKER = "voltmark";

/** Services are RESTRICT on purpose, so removal follows the FK graph down. */
async function deleteServices(ids: string[]) {
  if (!ids.length) return;
  const questions = await prisma.question.findMany({ where: { serviceId: { in: ids } }, select: { id: true } });
  const qIds = questions.map((q) => q.id);
  const options = await prisma.answerOption.findMany({ where: { questionId: { in: qIds } }, select: { id: true } });
  const oIds = options.map((o) => o.id);

  await prisma.answerOptionComponent.deleteMany({ where: { answerOptionId: { in: oIds } } });
  await prisma.answerOptionDisclaimer.deleteMany({ where: { answerOptionId: { in: oIds } } });
  await prisma.answerOptionPhotoGroup.deleteMany({ where: { answerOptionId: { in: oIds } } });
  await prisma.questionDisclaimer.deleteMany({ where: { questionId: { in: qIds } } });
  await prisma.answerOption.deleteMany({ where: { questionId: { in: qIds } } });
  await prisma.question.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
  await prisma.service.deleteMany({ where: { id: { in: ids } } });
}

async function destroy() {
  const c = await prisma.contractor.findUnique({
    where: { slug: DEMO.slug },
    select: { id: true, name: true },
  });
  if (!c) {
    console.log(`  no contractor with slug "${DEMO.slug}"`);
    await destroyOperator();
    return;
  }
  if (!c.name.toLowerCase().includes(DEMO_MARKER)) {
    throw new Error(
      `REFUSING to delete ${c.id}: name "${c.name}" is not the demo contractor. ` +
        `This script deletes a whole tenant and will only ever delete its own.`,
    );
  }

  const areas = await prisma.serviceArea.findMany({ where: { contractorId: c.id }, select: { id: true } });
  const areaIds = areas.map((a) => a.id);
  // ArrivalWindow -> ServiceArea is RESTRICT, so it has to go first.
  await prisma.arrivalWindow.deleteMany({ where: { serviceAreaId: { in: areaIds } } });

  const services = await prisma.service.findMany({ where: { contractorId: c.id }, select: { id: true } });
  await deleteServices(services.map((s) => s.id));

  await prisma.contractor.delete({ where: { id: c.id } });

  await destroyOperator();
  console.log(`  removed demo contractor ${c.id} (${c.name}) and everything under it`);
}

/*
 * The invented economics that used to live here are gone.
 *
 * Building the demo tenant from the template meant choosing crew-hours,
 * material costs, per-answer price adjustments and reroute destinations for
 * it — every one a number somebody made up, and one of them (forcing
 * materialCostResolved) actively defeating a guard. Cloning a contractor who
 * had already made those decisions removes the need to invent any of them.
 */

/**
 * Tidy up after the clone.
 *
 * Everything the old version of this did — choosing crew-hours, computing
 * prices, publishing them, configuring answer economics and reroute targets —
 * is now inherited from a contractor who had already made those decisions. All
 * that is left is removing categories the copied slice did not fill.
 */
async function tidy(contractorId: string) {
  const live = await prisma.service.findMany({
    where: { contractorId, active: true },
    select: { contractorCategoryId: true },
  });
  const liveCats = [...new Set(live.map((s) => s.contractorCategoryId).filter((v): v is string => !!v))];
  await prisma.contractorCategory.deleteMany({ where: { contractorId, id: { notIn: liveCats } } });
  await prisma.contractorCategory.updateMany({ where: { id: { in: liveCats } }, data: { active: true } });

  const priced = await prisma.service.count({ where: { contractorId, active: true, basePrice: { not: null } } });
  const total = await prisma.service.count({ where: { contractorId } });
  const unresolved = await prisma.service.count({
    where: { contractorId, OR: [{ unresolvedMaterialKeys: { isEmpty: false } }, { unresolvedPolicyKeys: { isEmpty: false } }] },
  });
  console.log(`  ${total} services · ${priced} priced · ${unresolved} with unresolved requirements · ${liveCats.length} categories`);
}

/**
 * The demo operator account.
 *
 * Deleting the contractor removes the membership, so the account already
 * grants nothing — but an orphaned identity left in a production auth table is
 * the kind of leftover that looks deliberate to whoever finds it next.
 * create() upserts it back.
 */
async function destroyOperator() {
  const user = await prisma.user.findUnique({ where: { email: DEMO.userEmail }, select: { id: true } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } });
    await prisma.account.deleteMany({ where: { userId: user.id } });
    await prisma.user.delete({ where: { id: user.id } });
    console.log(`  removed demo operator ${DEMO.userEmail}`);
  }
  await prisma.verification.deleteMany({ where: { identifier: { contains: DEMO.userEmail } } });
}

async function create() {
  await destroy();

  const c = await prisma.contractor.create({
    data: {
      slug: DEMO.slug,
      name: DEMO.name,
      shortName: DEMO.shortName,
      phone: DEMO.phone,
      supportEmail: DEMO.supportEmail,
      serviceAreaLabel: DEMO.serviceAreaLabel,
      themeFamily: DEMO.themeFamily,
      themeVariant: DEMO.themeVariant,
      themeVersion: DEMO.themeVersion,
      pricingStrategy: "FLAT_RATE",
      active: true,
    },
    select: { id: true },
  });
  console.log(`  contractor ${c.id}`);

  await prisma.contractorSite.create({
    data: { contractorId: c.id, hostedSlug: DEMO.slug, publicId: `demo_${c.id.slice(-10)}`, active: true },
  });

  await prisma.pricingSettings.create({
    data: {
      contractorId: c.id,
      crewHourRateCents: 18_500,
      primaryMinimumCents: 19_900,
      roundingIncrementCents: 500,
      defaultPermitAdminCents: 0,
    },
  });

  await prisma.businessHours.create({
    data: { contractorId: c.id, workingDays: [1, 2, 3, 4, 5], dayStart: "08:00", dayEnd: "16:30" },
  });

  // A territory with no ZIP codes fails closed — nobody can book — and the
  // portal says so in as many words. Correct behavior, and a screenshot of a
  // contractor who cannot take a booking is not what this demonstrates, so the
  // demo picks a couple of real counties the way a contractor would.
  const zips = await prisma.zipCode.findMany({
    where: { state: "NJ", county: { in: ["Monmouth", "Ocean"] } },
    select: { zip: true },
  });
  await prisma.serviceArea.create({
    data: {
      contractorId: c.id,
      name: DEMO.serviceAreaLabel,
      zipCodes: zips.map((z) => z.zip),
      active: true,
    },
  });

  /**
   * The catalog comes from Elite's, not from the template.
   *
   * Template-provisioned services carry material quantities that come from a
   * policy, and nothing in the product can set a policy — so those services
   * can never be priced and a demo built on them shows only refusals. Elite's
   * catalog predates the template, is fully resolved, and carries real
   * costs and real published prices. Identity is not copied; the source's name
   * is rewritten out of every field that carried it.
   */
  const source = await prisma.contractor.findUnique({
    where: { slug: SOURCE_SLUG },
    select: { id: true, name: true, shortName: true, pricingSettings: { select: { crewHourRateCents: true, primaryMinimumCents: true, roundingIncrementCents: true, defaultPermitAdminCents: true } } },
  });
  if (!source) throw new Error(`No contractor "${SOURCE_SLUG}" to copy the catalog from.`);

  // Their rate too, so the copied prices and the rate behind them agree.
  if (source.pricingSettings) {
    await prisma.pricingSettings.update({
      where: { contractorId: c.id },
      data: source.pricingSettings,
    });
  }

  console.log(`  copying a slice of ${source.name}'s catalog…`);
  const cloned = await cloneCatalog(prisma, {
    fromContractorId: source.id,
    toContractorId: c.id,
    slugs: DEMO_SERVICES,
    sourceName: new RegExp(source.shortName ?? "Elite", "gi"),
    replacementName: DEMO.shortName,
  });
  console.log(`  ${cloned.services} services copied · ${cloned.renamed} text fields de-branded`);

  // Access for the demo operator only. This user has no platform access and
  // no membership of any real contractor.
  const user = await prisma.user.upsert({
    where: { email: DEMO.userEmail },
    update: { name: DEMO.userName },
    create: { id: `demo_user_${c.id.slice(-8)}`, email: DEMO.userEmail, name: DEMO.userName, emailVerified: true },
    select: { id: true },
  });
  await prisma.contractorMembership.upsert({
    where: { userId_contractorId: { userId: user.id, contractorId: c.id } },
    update: { role: "OWNER", active: true },
    create: { userId: user.id, contractorId: c.id, role: "OWNER", active: true },
  });

  await tidy(c.id);

  const services = await prisma.service.count({ where: { contractorId: c.id, active: true } });
  console.log(`  ${services} active services · storefront /${DEMO.slug} · operator ${DEMO.userEmail}`);
}

/**
 * Mint a sign-in link WITHOUT sending mail.
 *
 * Deliberately goes through the real magic-link issuer rather than forging a
 * session cookie: the screenshots should be of the product as a contractor
 * actually reaches it, and a hand-made session would be the one part of the
 * capture that is not real. A parallel Better Auth instance shares this
 * database, so the token it issues is verified by the running app exactly as
 * an emailed one would be — the only difference is that the link is printed
 * here instead of posted to a mailbox nobody owns.
 */
async function signInUrl(baseUrl: string) {
  const { betterAuth } = await import("better-auth");
  const { prismaAdapter } = await import("better-auth/adapters/prisma");
  const { magicLink } = await import("better-auth/plugins/magic-link");

  let captured = "";
  const instance = betterAuth({
    baseURL: baseUrl,
    trustedOrigins: [baseUrl],
    database: prismaAdapter(prisma, { provider: "postgresql" }),
    emailAndPassword: { enabled: false },
    plugins: [
      magicLink({
        expiresIn: 15 * 60,
        sendMagicLink: async ({ url }) => { captured = url; },
      }),
    ],
  });

  await instance.api.signInMagicLink({
    body: { email: DEMO.userEmail, callbackURL: "/dashboard" },
    headers: new Headers(),
  });
  if (!captured) throw new Error("no magic link was issued");
  console.log(captured);
}

async function main() {
  const argv = process.argv;
  const base = argv.includes("--base") ? argv[argv.indexOf("--base") + 1] : "http://localhost:3000";
  if (argv.includes("--create")) await create();
  else if (argv.includes("--destroy")) await destroy();
  else if (argv.includes("--sign-in-url")) await signInUrl(base);
  else {
    console.error("  one of --create | --destroy | --sign-in-url [--base <url>] required");
    process.exitCode = 1;
  }
  await prisma.$disconnect();
}

/**
 * Only run when invoked directly. capture-marketing-shots.ts imports DEMO from
 * here, and an import must not execute a script that creates or deletes a
 * tenant.
 */
const invokedDirectly = process.argv[1]?.endsWith("demo-contractor.ts") ?? false;
if (!invokedDirectly) {
  prisma.$disconnect();
} else {
main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
}
