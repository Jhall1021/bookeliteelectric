import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { loadEnv } from "./_env";
loadEnv();
const p = new PrismaClient();
async function main() {
  const u = await p.user.findFirstOrThrow({ select: { id: true, email: true } });
  const token = randomBytes(32).toString("base64url");
  const s = await p.session.create({
    data: { id: randomBytes(16).toString("hex"), token, userId: u.id,
            expiresAt: new Date(Date.now() + 2 * 60 * 60 * 1000) },
  });
  console.log(`SESSION_ID=${s.id}`);
  console.log(`TOKEN=${token}`);
  await p.$disconnect();
}
main();
