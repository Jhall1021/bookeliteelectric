import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { name, shortDescription, disclaimer, basePrice, whileWeThereBasePrice, startingPriceLabel, active } = body;

  if (!name || typeof name !== "string") {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  await prisma.service.update({
    where: { id: params.serviceId },
    data: {
      name,
      shortDescription: shortDescription ?? null,
      disclaimer: disclaimer ?? null,
      basePrice: typeof basePrice === "number" ? basePrice : null,
      whileWeThereBasePrice: typeof whileWeThereBasePrice === "number" ? whileWeThereBasePrice : null,
      startingPriceLabel: startingPriceLabel ?? null,
      active: !!active,
    },
  });

  return NextResponse.json({ ok: true });
}
