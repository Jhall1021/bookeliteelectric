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

const LIMITS = { name: 120, company: 160, email: 254, trade: 80, runsOn: 120, crewSize: 40 } as const;

/**
 * The optional fields are structured choices on the form, so the server
 * accepts only those values and drops anything else.
 *
 * Not validation theatre: the point of asking "what do you run on" as a menu
 * is that the answers are countable afterwards. One free-text "jobber pro?"
 * silently ruins that, and a rejected submission would cost a real lead — so
 * an unrecognized value is discarded rather than refused.
 */
const TRADES = [
  "Residential electrical", "Plumbing", "HVAC", "Multi-trade", "Something else",
] as const;
const RUNS_ON = [
  "Jobber", "ServiceTitan", "Housecall Pro", "Another field-service platform",
  "Google or Outlook Calendar", "Spreadsheets or paper", "Nothing yet",
] as const;
const CREW_SIZES = ["Just me", "2–3", "4–6", "7–12", "13 or more"] as const;

const oneOf = (v: string, allowed: readonly string[]) => (allowed.includes(v) ? v : "");

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
  const trade = oneOf(field(b.trade, LIMITS.trade), TRADES);
  const runsOn = oneOf(field(b.runsOn, LIMITS.runsOn), RUNS_ON);
  const crewSize = oneOf(field(b.crewSize, LIMITS.crewSize), CREW_SIZES);

  // A honeypot, not a CAPTCHA. Anything that fills a field no human can see
  // is answered exactly as a success would be — telling a bot it was caught
  // only tells it what to change.
  if (field(b.website, 200) !== "") {
    return NextResponse.json({ ok: true });
  }

  // Per-field messages, so the form can say what is wrong beside the field
  // that is wrong rather than printing one sentence about the whole form.
  const errors: Record<string, string> = {};
  if (!name) errors.name = "Please tell us your name.";
  if (!company) errors.company = "Please tell us your company.";
  if (!email) errors.email = "Please give us an email address.";
  else if (!EMAIL.test(email)) errors.email = "That email address doesn’t look right.";
  if (!trade) errors.trade = "Please choose the trade you run.";

  if (Object.keys(errors).length) {
    return NextResponse.json(
      { error: "Please check the highlighted fields.", errors, missing: Object.keys(errors) },
      { status: 400 },
    );
  }

  await prisma.earlyAccessRequest.create({
    data: {
      name, company, email, trade,
      runsOn: runsOn || null,
      crewSize: crewSize || null,
      source: "homepage",
    },
  });

  return NextResponse.json({ ok: true });
}
