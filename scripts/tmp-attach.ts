import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  console.log("attachments total:   ", await p.answerOptionComponent.count());
  console.log("with canonical link: ", await p.answerOptionComponent.count({ where: { canonicalComponentId: { not: null } } }));
  console.log("canonical components:", await p.canonicalComponent.count());
  console.log("contractor components:", await p.contractorComponent.count());
  console.log("retired (inactive):  ", await p.canonicalComponent.count({ where: { active: false } }));
}
main().finally(() => p.$disconnect());
