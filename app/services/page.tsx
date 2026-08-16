import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function ServicesPage() {
  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: { services: { where: { active: true }, select: { id: true } } },
  });

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">What can we help you with today?</h1>

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {categories.map((cat) => (
          <Link
            key={cat.id}
            href={`/services/${cat.slug}`}
            className="rounded-card border border-cardline bg-white p-5 text-center shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
          >
            <div className="text-sm font-semibold text-navy">{cat.name}</div>
            <div className="mt-1 text-xs text-slate">{cat.services.length} services</div>
          </Link>
        ))}
      </div>

      <div className="mt-10 rounded-card border border-cardline bg-navy p-6 text-center text-white">
        <p className="font-medium">Not sure what you need?</p>
        <p className="mt-1 text-sm text-white/70">Tell us what's going on and we'll point you in the right direction.</p>
        <Link
          href="/troubleshooting"
          className="mt-4 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
        >
          I Don't Know What's Wrong
        </Link>
      </div>
    </main>
  );
}
