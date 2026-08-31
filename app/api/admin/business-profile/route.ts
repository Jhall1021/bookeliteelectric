/**
 * The contractor's own details — name, contact, license, country.
 *
 * A GENERAL admin writer, not a setup-only one. Nothing in the dashboard
 * edited these before Guided Setup needed them, and the temptation was to put
 * the form behind the wizard. That would have made the wizard the only way to
 * change a business phone number, which is the wrong shape for a fact that
 * stays true long after setup finishes — the same reasoning that put
 * `Service.offered` on Service. A later Settings page reuses this route rather
 * than growing a second writer.
 *
 * WHAT IT DOES NOT TOUCH
 *
 * No pricing, no activation, no storefront routing identity. `hostedSlug` and
 * `publicId` are addresses the platform issues, not fields a contractor types
 * — see the storefront route beside this one.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { checkCountry } from "@/lib/contractorIdentity";

/** Trimmed; empty becomes null, which is distinct from "not sent". */
function optionalText(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const name = optionalText(body.name);
  if (name === null) {
    return NextResponse.json(
      { error: "NAME_REQUIRED", message: "Your business name is what a homeowner sees. It cannot be empty." },
      { status: 400 }
    );
  }

  // The country decides whether payments can be set up at all, so a value that
  // would fail later is refused here with the reason the payment system gives.
  const countryRaw = optionalText(body.countryCode);
  let countryCode: string | null | undefined = countryRaw;
  if (typeof countryRaw === "string") {
    const check = checkCountry(countryRaw);
    if (!check.ok) {
      return NextResponse.json({ error: "COUNTRY_UNSUPPORTED", message: check.reason }, { status: 400 });
    }
    countryCode = countryRaw.trim().toUpperCase();
  }

  const data: Record<string, unknown> = {};
  if (name !== undefined) data.name = name;
  if (countryCode !== undefined) data.countryCode = countryCode;
  for (const field of ["legalName", "phone", "supportEmail", "licenseNumber", "licenseLabel"] as const) {
    const v = optionalText(body[field]);
    if (v !== undefined) data[field] = v;
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  return withAdminRoute(async (db, ctx) => {
    await db.contractor.update({ where: { id: ctx.contractorId }, data });
    return NextResponse.json({ ok: true, changed: Object.keys(data) });
  });
}
