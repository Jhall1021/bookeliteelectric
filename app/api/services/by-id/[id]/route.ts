import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// REROUTE_SERVICE answer options only store a serviceId (the AnswerOption
// model doesn't know slugs). The client needs the slug to navigate to the
// new service's flow page.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const full = await prisma.service.findUnique({
    where: { id: params.id },
    include: { category: { select: { slug: true } } },
  });

  if (!full) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: full.slug,
    name: full.name,
    categorySlug: full.category.slug,
  });
}
