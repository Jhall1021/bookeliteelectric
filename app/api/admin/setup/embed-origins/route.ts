import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { normalizeEmbedOrigin, validateEmbedOrigin } from "@/lib/embedOrigins";

/**
 * The websites allowed to embed this contractor's storefront.
 *
 * The whole of the framing decision — see lib/embedOrigins. An empty list
 * means nobody, which makes the embed unusable and is the correct failure: a
 * contractor can fix an embed nobody can frame, and cannot fix one anybody
 * can.
 */
export async function PATCH(req: Request) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }

  const raw = (parsed as Record<string, unknown>).origins;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "Expected a list of website addresses." }, { status: 400 });
  }

  const cleaned: string[] = [];
  for (const entry of raw) {
    // Blank form rows are harmless and intentionally ignored, but a non-text
    // value is malformed input. Silently dropping an object/number could turn
    // a bad request into an unexpectedly empty allow-list and disable embeds.
    if (typeof entry !== "string") {
      return NextResponse.json({ error: "Every website address must be text." }, { status: 400 });
    }
    if (!entry.trim()) continue;

    const problem = validateEmbedOrigin(entry);
    if (problem) {
      return NextResponse.json({ error: problem.message, code: problem.code }, { status: 400 });
    }
    const normalized = normalizeEmbedOrigin(entry);
    if (!cleaned.includes(normalized)) cleaned.push(normalized);
  }

  if (cleaned.length > 10) {
    return NextResponse.json(
      { error: "That's more websites than we expect one business to have. Tell us if you need more." },
      { status: 400 }
    );
  }

  return withAdminRoute(async (db, ctx) => {
    // The site, not the contractor: framing is a property of the storefront
    // being framed, and a contractor could one day have more than one.
    const site = await db.contractorSite.findFirst({
      where: { contractorId: ctx.contractorId, active: true },
      select: { id: true },
    });
    if (!site) return NextResponse.json({ error: "No storefront to embed yet." }, { status: 400 });

    await db.contractorSite.update({
      where: { id: site.id },
      data: { embedOrigins: cleaned },
    });
    return NextResponse.json({ ok: true, origins: cleaned });
  });
}
