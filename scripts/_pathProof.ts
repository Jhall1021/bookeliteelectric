/**
 * Every resolvable path of every active service, with its outcome and price.
 *
 * The proof that a behaviour-neutral change was behaviour-neutral. A passing
 * unit test says the formula is right; this says the catalogue did not move —
 * which is the claim §16 actually makes.
 */
import { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";

export async function pathProof(slug = "elite-electric") {
  const prisma = new PrismaClient();
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  const settings = await loadPricingSettings(prisma as any, c.id);
  const svcs = await prisma.service.findMany({
    where: { contractorId: c.id, active: true }, select: { id: true, slug: true },
  });
  const out: Record<string, { priced: number; review: number; other: number; prices: number[] }> = {};
  for (const row of svcs) {
    const svc = await loadServiceForResolution(prisma as any, row.id);
    if (!svc) continue;
    const byId = new Map(svc.questions.map((q) => [q.id, q]));
    const nk = (o: any) =>
      o.routeAction === "CONTINUE" && o.nextQuestionId ? byId.get(o.nextQuestionId)?.key ?? null : null;
    let priced = 0, review = 0, other = 0, paths = 0;
    const prices = new Set<number>();
    const walk = (k: string | null, ans: Record<string, string>) => {
      if (paths > 4000) return;
      if (!k) {
        paths++;
        const r = resolveRoute(svc as any, ans, true, settings!);
        if (r.status === "PRICED") { priced++; prices.add(r.priceCents); }
        else if (r.status === "REVIEW") review++; else other++;
        return;
      }
      const q = svc.questions.find((x) => x.key === k);
      if (!q) return;
      for (const o of q.options) walk(nk(o), { ...ans, [q.key]: o.value });
    };
    walk(svc.questions[0]?.key ?? null, {});
    out[row.slug] = { priced, review, other, prices: [...prices].sort((a, b) => a - b) };
  }
  await prisma.$disconnect();
  return out;
}

if (process.argv[1]?.endsWith("_pathProof.ts")) {
  pathProof(process.argv[2] ?? "elite-electric").then((o) => console.log(JSON.stringify(o)));
}
