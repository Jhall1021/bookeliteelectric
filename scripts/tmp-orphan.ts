import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
async function main() {
  const bad = await p.serviceMaterial.findMany({
    where: { canonicalMaterialId: null },
    select: { id: true, materialId: true, quantity: true,
              service: { select: { slug: true, id: true } } },
  });
  console.log("orphaned recipe lines:", bad.length);
  for (const b of bad) console.log(`  ${b.service.slug}  materialId=${b.materialId}  qty=${b.quantity}`);
  console.log("total recipe lines:", await p.serviceMaterial.count());
}
main().finally(() => p.$disconnect());
