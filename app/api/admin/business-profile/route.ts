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
 *
 * IT ALSO OWNS TRADE ENROLMENT, for the same reason it owns the rest: which
 * canonical catalog a contractor works from stays true long after setup
 * finishes. `Contractor.trade` — the descriptive prose the service finder
 * reads — is a different fact and is edited separately here; enrolment never
 * touches it.
 *
 * The route decides nothing itself. What the body means is
 * `readBusinessProfileRequest` (lib/businessProfileRequest); the enrolment
 * write is `setTradeEnrolment` (lib/tradeEnrolment). Both are shared so the
 * next writer — Settings, Platform Admin — reuses the same decisions.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { readBusinessProfileRequest } from "@/lib/businessProfileRequest";
import { setTradeEnrolment } from "@/lib/tradeEnrolment";

export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const request = readBusinessProfileRequest(body);
  if (!request.ok) {
    // Kept as the caller-facing text it always was; the code travels beside it.
    if (request.error === "NOTHING_TO_CHANGE") {
      return NextResponse.json({ error: request.message, code: request.error }, { status: 400 });
    }
    return NextResponse.json({ error: request.error, message: request.message }, { status: 400 });
  }
  const { data, tradeKey } = request;

  return withAdminRoute(async (db, ctx) => {
    if (tradeKey !== undefined) {
      const result = await setTradeEnrolment(db, ctx.contractorId, tradeKey);
      if (!result.ok) {
        return NextResponse.json({ error: result.code, message: result.message }, { status: 409 });
      }
    }
    if (Object.keys(data).length > 0) {
      await db.contractor.update({ where: { id: ctx.contractorId }, data });
    }
    return NextResponse.json({
      ok: true,
      changed: [...Object.keys(data), ...(tradeKey !== undefined ? ["tradeKey"] : [])],
    });
  });
}
