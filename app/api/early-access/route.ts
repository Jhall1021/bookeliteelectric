import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * The marketing site's early-access form — ADR-020.
 *
 * This is the one PUBLIC, UNAUTHENTICATED write in the application, which is
 * why the model it writes to is platform-owned and joined to nothing. There is
 * no contractor context to establish here and none is invented: the person
 * posting is a stranger, and the row records that a stranger asked.
 *
 * Everything below is about keeping that true. Fields are read individually
 * rather than spread, so a caller cannot set `contactedAt`, `source` or an id
 * by adding keys. Lengths are capped so the endpoint cannot be used to store
 * arbitrary volumes of text. And the response never varies on whether an
 * address has been seen before — "we already have you" would turn the form
 * into an oracle for which contractors have applied.
 */

const LIMITS = { name: 120, company: 160, email: 254, runsOn: 400 } as const;

/** Deliberately permissive. Rejecting unusual-but-valid addresses on a lead
 *  form costs a real customer; a malformed one costs an operator ten seconds. */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function field(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;

  const name = field(b.name, LIMITS.name);
  const company = field(b.company, LIMITS.company);
  const email = field(b.email, LIMITS.email);
  const runsOn = field(b.runsOn, LIMITS.runsOn);

  // A honeypot, not a CAPTCHA. Anything that fills a field no human can see
  // is answered exactly as a success would be — telling a bot it was caught
  // only tells it what to change.
  if (field(b.website, 200) !== "") {
    return NextResponse.json({ ok: true });
  }

  const missing = [
    !name && "name",
    !company && "company",
    !email && "email",
  ].filter(Boolean) as string[];
  if (missing.length) {
    return NextResponse.json(
      { error: "Please fill in your name, company and email.", missing },
      { status: 400 },
    );
  }
  if (!EMAIL.test(email)) {
    return NextResponse.json(
      { error: "That email address doesn’t look right.", missing: ["email"] },
      { status: 400 },
    );
  }

  await prisma.earlyAccessRequest.create({
    data: { name, company, email, runsOn: runsOn || null, source: "homepage" },
  });

  return NextResponse.json({ ok: true });
}
