import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function POST(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { categoryId, name, slug, shortDescription, bookingType, basePrice, whileWeThereBasePrice, startingPriceLabel, icon } = body;

  if (!categoryId || !name || !slug || !bookingType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const existing = await prisma.service.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `A service with the slug "${slug}" already exists — try a different name or edit the slug.` }, { status: 409 });
  }

  const service = await prisma.service.create({
    data: {
      categoryId,
      name,
      slug,
      shortDescription: shortDescription ?? null,
      bookingType,
      basePrice: typeof basePrice === "number" ? basePrice : null,
      whileWeThereBasePrice: typeof whileWeThereBasePrice === "number" ? whileWeThereBasePrice : null,
      startingPriceLabel: startingPriceLabel ?? null,
      icon: icon ?? null,
      active: true,
    },
  });

  return NextResponse.json({ id: service.id });
}
