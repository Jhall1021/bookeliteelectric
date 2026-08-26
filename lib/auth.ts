import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

/**
 * Identity and sessions only.
 *
 * Better Auth owns User, Session, Account and Verification. It does NOT own
 * authorization: which contractors a person may reach is ContractorMembership,
 * and whether they are Price2Book staff is PlatformAccess. Both are ours.
 *
 * The organization plugin is deliberately not enabled. Contractor is already
 * the business entity, with a slug, trade, branding and five configuration
 * relations hanging off it. A parallel Organization would mean mapping
 * between two ideas of the same thing.
 *
 * If Better Auth is ever replaced, four identity tables are replaced with it.
 * Who owns Elite, who may reach contractor #2, and who works for Price2Book
 * stay exactly where they are.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
});
