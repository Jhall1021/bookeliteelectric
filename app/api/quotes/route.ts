import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Body: { serviceId, answersSnapshot, photos: [{ url, label }], name, email, phone }
// Photos are already uploaded to R2 by this point (client got the URLs from
// /api/uploads/presign) — this just records the Quote + Photo rows.
export async function POST(req: Request) {
  const body = await req.json();
  const { serviceId, answersSnapshot, photos, name, email, phone } = body;

  if (!serviceId || !Array.isArray(photos) || photos.length === 0) {
    return NextResponse.json({ error: "Missing serviceId or photos" }, { status: 400 });
  }
  if (!name || !email) {
    return NextResponse.json({ error: "Missing name or email" }, { status: 400 });
  }

  const customer = await prisma.customer.create({ data: { name, email, phone } });

  const quote = await prisma.quote.create({
    data: {
      customerId: customer.id,
      serviceId,
      answersSnapshot: answersSnapshot ?? {},
      status: "SUBMITTED",
      photos: {
        create: photos.map((p: { url: string; label: string }) => ({
          url: p.url,
          label: p.label,
          source: "CUSTOMER_PRE_BOOKING",
        })),
      },
    },
  });

  return NextResponse.json({ quoteId: quote.id });
}
