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
 * resolve). No street address or licence number is set at all, because the
 * identity resolver omits an incomplete one entirely rather than half-render
 * it — which is exactly the behaviour we want here. Inventing a plausible
 * address and licence for a business that does not exist would be fabricating
 * a record, and a screenshot is a publication.
 *
 *   npx tsx scripts/demo-contractor.ts --create
 *   npx tsx scripts/demo-contractor.ts --sign-in-url
 *   npx tsx scripts/demo-contractor.ts --destroy
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { suggestPrimaryPrice, suggestWwtPrice } from "../lib/pricing";

const prisma = new PrismaClient();

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

/**
 * The economics a contractor supplies during Guided Setup.
 *
 * Crew-hours and material costs are the two things the template deliberately
 * does NOT carry (ADR-014: trade structure, never economics), so a freshly
 * provisioned contractor has 75 services and no prices — which is correct, and
 * unphotographable. These are plausible numbers for a demonstration business,
 * and they are run through the SAME suggestPrimaryPrice the dashboard uses, so
 * every figure on the screenshots is one the product actually computes rather
 * than one written into a fixture.
 */
const DEMO_ECONOMICS: Record<string, { hours: number; materialCents: number }> = {
  "home-electrical-safety-inspection": { hours: 1.5, materialCents: 0 },
  "smart-thermostat-install": { hours: 1.0, materialCents: 0 },
  "video-doorbell-existing-wiring": { hours: 1.0, materialCents: 0 },
  "otr-microwave-install": { hours: 1.5, materialCents: 2_500 },
  "install-new-microwave": { hours: 1.5, materialCents: 2_500 },
  "dishwasher-electrical": { hours: 1.25, materialCents: 1_500 },
  "garbage-disposal-install": { hours: 1.25, materialCents: 1_200 },
  "replace-range-hood": { hours: 2.0, materialCents: 4_500 },
  "tv-install-existing-location": { hours: 1.25, materialCents: 2_000 },
  "tilt-tv-mount": { hours: 1.5, materialCents: 6_500 },
  "articulating-tv-mount": { hours: 1.75, materialCents: 9_500 },
  "soundbar-installation": { hours: 1.25, materialCents: 3_500 },
  "bathroom-fan-light-combo": { hours: 2.0, materialCents: 8_500 },
};

/** Quoted work: shown, priced by the contractor, never priced automatically. */
const DEMO_QUOTED = ["level-2-ev-charger", "electrical-panel-replacement", "200a-service-upgrade"];

async function dress(contractorId: string) {
  // Provisioning offers the whole template. A real contractor turns on the
  // work they actually sell, so the demo does too — and the alternative reads
  // badly and dishonestly: 75 services, 62 of them unpriced, is a picture of
  // an abandoned setup rather than of the product working.
  const keep = new Set([...Object.keys(DEMO_ECONOMICS), ...DEMO_QUOTED]);
  const surplus = await prisma.service.findMany({
    where: { contractorId, OR: [{ templateKey: null }, { templateKey: { notIn: [...keep] } }] },
    select: { id: true },
  });
  await deleteServices(surplus.map((s) => s.id));

  const settings = await prisma.pricingSettings.findUniqueOrThrow({
    where: { contractorId },
    select: { crewHourRateCents: true, primaryMinimumCents: true, roundingIncrementCents: true, defaultPermitAdminCents: true },
  });

  // Everything starts hidden. A demo storefront showing 75 unpriced services
  // would misrepresent the product as badly as a fabricated price would.
  await prisma.service.updateMany({ where: { contractorId }, data: { active: false } });

  let priced = 0;
  for (const [key, econ] of Object.entries(DEMO_ECONOMICS)) {
    const svc = await prisma.service.findFirst({
      where: { contractorId, templateKey: key },
      select: { id: true, requiresTechCount: true, isPrimaryEligible: true },
    });
    if (!svc) { console.log(`    ! no service for template key ${key}`); continue; }

    const inputs = {
      fieldLaborHours: econ.hours,
      wwtLaborHours: Math.round(econ.hours * 0.6 * 100) / 100,
      requiresTechCount: svc.requiresTechCount,
      materialCostCents: econ.materialCents,
      materialMultiplier: null,
      permitAdminCents: null,
      otherDirectCostCents: null,
      isPrimaryEligible: svc.isPrimaryEligible,
    };
    const primary = suggestPrimaryPrice(inputs, settings);
    const wwt = suggestWwtPrice(inputs, settings);

    await prisma.service.update({
      where: { id: svc.id },
      data: {
        fieldLaborHours: inputs.fieldLaborHours,
        wwtLaborHours: inputs.wwtLaborHours,
        materialCostCents: econ.materialCents,
        materialCostResolved: true,
        estimatedMinutes: Math.round(econ.hours * 60),
        estimatedMinutesReviewed: true,
        // Suggested becomes published only by an explicit act. Here that act
        // is this line, and it is recorded — the same stamp the dashboard sets.
        basePrice: primary.totalCents,
        whileWeThereBasePrice: wwt.totalCents,
        publishedPriceApprovedAt: new Date(),
        active: true,
      },
    });
    priced++;
  }

  for (const key of DEMO_QUOTED) {
    await prisma.service.updateMany({ where: { contractorId, templateKey: key }, data: { active: true } });
  }

  // A category with nothing in it is not a category. Trimming the catalogue
  // leaves the contractor's category rows behind, and the portal lists every
  // category it owns — so without this the demo shows five empty headings,
  // which is a picture of a half-finished setup.
  const live = await prisma.service.findMany({
    where: { contractorId, active: true },
    select: { contractorCategoryId: true },
  });
  const liveCats = [...new Set(live.map((s) => s.contractorCategoryId).filter((v): v is string => !!v))];
  await prisma.contractorCategory.deleteMany({ where: { contractorId, id: { notIn: liveCats } } });
  await prisma.contractorCategory.updateMany({ where: { id: { in: liveCats } }, data: { active: true } });

  console.log(`  ${priced} services priced and published · ${DEMO_QUOTED.length} quoted · ${liveCats.length} categories live`);
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
  // portal says so in as many words. Correct behaviour, and a screenshot of a
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

  // The SHIPPED provisioning path, not a bespoke seeder — a screenshot of
  // something built a different way from a real contractor's catalogue would
  // be a picture of software that does not exist.
  console.log("  provisioning from the electrical template…");
  const out = execFileSync(
    "npx",
    ["tsx", "scripts/provision-from-template.ts", "--contractor", DEMO.slug, "--apply"],
    { encoding: "utf8", stdio: "pipe" },
  );
  console.log(out.trim().split("\n").slice(-4).map((l) => `    ${l}`).join("\n"));

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

  await dress(c.id);

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
