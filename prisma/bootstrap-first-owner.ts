/**
 * The first owner — bootstrap only.
 *
 *   npx tsx prisma/bootstrap-first-owner.ts you@example.com "Your Name"
 *   npx tsx prisma/bootstrap-first-owner.ts you@example.com "Your Name" --apply
 *
 * WHY THIS EXISTS
 *
 * Better Auth owns User creation. That is the boundary, and this script is the
 * one deliberate exception to it.
 *
 * The problem is circular: signing in needs the auth route and platform mail
 * credentials, creating a membership needs a User, and a User is normally
 * created by signing in. Every system has this for its first administrator.
 * The usual answer is a one-time bootstrap, run knowingly, that is never part
 * of the normal path.
 *
 * WHAT IT DOES
 *
 * Creates a User row with the email you will sign in with, and an OWNER
 * membership for Elite. When you later request a magic link, Better Auth
 * matches on email and signs you into THIS user rather than creating a
 * second one.
 *
 * WHAT IT DOES NOT DO
 *
 * No password — magic link is the only method configured, and Account is left
 * empty. No session. Signing in still goes through Better Auth normally.
 *
 * IF SIGN-IN MISBEHAVES
 *
 * If the first magic link produces a different user, or complains about this
 * row, delete it and let Better Auth create its own — then re-run this script,
 * which will find the real user by email and attach the membership to it. The
 * membership half is the part that matters; the User half is only scaffolding.
 */

import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CONTRACTOR_SLUG = "elite-electric";

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--apply");
  const apply = process.argv.includes("--apply");

  const rawEmail = args[0];
  const name = args[1];

  if (!rawEmail || !name) {
    console.error(
      `\n  Usage: npx tsx prisma/bootstrap-first-owner.ts <email> "<name>" [--apply]\n`
    );
    process.exit(1);
    return;
  }

  // Normalised the same way invitations will be. Josh@ and josh@ must not
  // become two accounts.
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error(`\n  "${rawEmail}" doesn't look like an email address.\n`);
    process.exit(1);
    return;
  }

  console.log(`\nBOOTSTRAP — first owner`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply.\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: CONTRACTOR_SLUG },
    select: { id: true, name: true },
  });
  if (!contractor) {
    console.error(`  No contractor "${CONTRACTOR_SLUG}".\n`);
    process.exit(1);
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  const existingMembership = existingUser
    ? await prisma.contractorMembership.findUnique({
        where: {
          userId_contractorId: { userId: existingUser.id, contractorId: contractor.id },
        },
      })
    : null;

  // Owners already present. Shown because the last-owner rule makes this the
  // number that matters, and because a second bootstrap on a contractor that
  // already has an owner is usually a mistake.
  const owners = await prisma.contractorMembership.count({
    where: { contractorId: contractor.id, role: "OWNER" },
  });

  console.log(`  contractor        ${contractor.name}`);
  console.log(`  email             ${email}`);
  console.log(`  name              ${name}`);
  console.log(`  existing user     ${existingUser ? existingUser.id : "none — will be created"}`);
  console.log(`  existing member   ${existingMembership ? existingMembership.role : "none"}`);
  console.log(`  owners already    ${owners}\n`);

  if (existingMembership) {
    console.log(
      `  Nothing to do — that user is already ${existingMembership.role} of ` +
        `${contractor.name}.\n`
    );
    return;
  }

  if (owners > 0 && !existingUser) {
    console.log(
      `  Note: ${contractor.name} already has ${owners} owner(s). This will add\n` +
        `  another. That is allowed, but bootstrap is meant to run once — if you\n` +
        `  are adding a colleague, the invitation flow is the right path.\n`
    );
  }

  if (!apply) {
    console.log(`  Nothing was changed. Re-run with --apply.\n`);
    return;
  }

  const result = await prisma.$transaction(async (tx) => {
    // Better Auth's User.id has no default — it supplies ids itself. A UUID
    // is a safe, collision-free choice for a hand-made row.
    const user =
      existingUser ??
      (await tx.user.create({
        data: {
          id: randomUUID(),
          email,
          name,
          // Magic link proves control of the inbox, so treating this as
          // verified matches what the first sign-in will establish anyway.
          emailVerified: true,
        },
      }));

    const membership = await tx.contractorMembership.create({
      data: {
        userId: user.id,
        contractorId: contractor.id,
        role: "OWNER",
        // No inviter: this account was bootstrapped, not invited. Worth being
        // able to tell those apart later.
        invitedByUserId: null,
      },
    });

    return { user, membership };
  });

  // Read back rather than reprinting what was sent.
  const check = await prisma.contractorMembership.findUnique({
    where: {
      userId_contractorId: { userId: result.user.id, contractorId: contractor.id },
    },
    select: { role: true, user: { select: { email: true, name: true } } },
  });

  console.log(`  CREATED — read back from the database:\n`);
  console.log(`      user        ${check?.user.name} <${check?.user.email}>`);
  console.log(`      membership  ${check?.role} of ${contractor.name}`);
  console.log(`      user id     ${result.user.id}`);

  console.log(
    `\n  Sign in with ${email} once the auth route and platform mail exist.\n` +
      `  Better Auth will match on email and use this user rather than\n` +
      `  creating a second one.\n`
  );
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
