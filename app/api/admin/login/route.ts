import { NextResponse } from "next/server";
import { checkAdminPassword, setAdminSessionCookie } from "@/lib/adminAuth";

export async function POST(req: Request) {
  const { password } = await req.json();

  if (!checkAdminPassword(password)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  setAdminSessionCookie();
  return NextResponse.json({ ok: true });
}
