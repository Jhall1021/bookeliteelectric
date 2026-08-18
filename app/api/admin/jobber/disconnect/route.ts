import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function POST() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  await prisma.jobberConnection.deleteMany({ where: { id: "default" } });
  return NextResponse.json({ ok: true });
}
