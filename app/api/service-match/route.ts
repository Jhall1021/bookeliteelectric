import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categorySlug, requireContractorCategory } from "@/lib/categories";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import {
  screenForEmergency,
  normalize,
  keywordFallback,
  buildPrompt,
  parseResponse,
  recordQuery,
  type MatchResult,
} from "@/lib/serviceMatch";

export const dynamic = "force-dynamic";

const EMERGENCY_MESSAGE =
  "What you're describing could be a safety issue, and it isn't something to book online for later. Please call us on 732-204-7003 and we'll talk it through now. If there's smoke, a burning smell, or anything is hot to the touch, switch off the breaker if you can reach it safely — and call 911 if you think there's a fire.";

export async function POST(req: Request) {
  // ADR §2.2. The site identifier the caller carries decides the tenant.
  // Resolving it from the requested resource would authorise access to that
  // resource using itself.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  let text: string;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json({ kind: "unsure", message: "" });
  }
  const raw = text.trim().slice(0, 500);

  // ---- 1. Safety, before anything else ---------------------------------
  //
  // No cache lookup, no model, no network. If everything downstream is
  // broken, this still fires.
  const emergency = screenForEmergency(raw);
  if (emergency.isEmergency) {
    const result: MatchResult = {
      kind: "emergency",
      matched: emergency.matched,
      message: EMERGENCY_MESSAGE,
    };
    await withSite(site, (db) =>
      recordQuery(db, site.contractorId, normalize(raw), raw, result, {
        source: "safety-screen",
      })
    ).catch(
      () => {}
    );
    return NextResponse.json(result);
  }

  const normalized = normalize(raw);

  const services = await withSite(site, (db) =>
    db.service.findMany({
    where: { active: true },
    select: {
      slug: true,
      name: true,
      shortDescription: true,
      contractorCategory: { select: { canonicalCategory: { select: { slug: true } } } },
    },
    })
  );
  const flat = services.map((s) => ({
    slug: s.slug,
    name: s.name,
    shortDescription: s.shortDescription,
    categorySlug: categorySlug(requireContractorCategory(s.slug, s.contractorCategory)),
  }));

  // ---- 2. Has someone asked this before? -------------------------------
  //
  // CROSS-TENANT TODAY — ADR-008. This key is globally unique, so contractor
  // B's customer can hit contractor A's cached match. Pass four re-keys it on
  // (contractorId, normalizedText).
  //
  // What is holding the line in the meantime is the `flat.find` below, and it
  // is holding it by accident: Service.slug is globally unique, so a slug
  // cached by another contractor is never found in this contractor's catalog
  // and the cache degrades to asking the model. That protection disappears
  // the moment slugs become per-contractor — which is why ADR-008 says
  // ServiceQuery must be re-keyed BEFORE, or with, that change.
  // ADR-008: this contractor's cache, not a platform-wide one. The lookup was
  // keyed on the phrase alone, so a match cached by one contractor answered
  // for every contractor — for a slug that may not even exist in their
  // catalog.
  const cached = await withSite(site, (db) =>
    db.serviceQuery.findUnique({
      where: { contractorId_normalizedText: { contractorId: site.contractorId, normalizedText: normalized } },
    })
  );
  if (cached?.matchedServiceSlug) {
    const svc = flat.find((s) => s.slug === cached.matchedServiceSlug);
    // Only trust the cache if the service still exists and is active — a
    // retired service shouldn't be suggested forever because it was popular.
    if (svc) {
      await withSite(site, (db) =>
        db.serviceQuery.update({
          where: { id: cached.id },
          data: { timesAsked: { increment: 1 } },
        })
      ).catch(() => {});
      return NextResponse.json({
        kind: "suggestion",
        serviceSlug: svc.slug,
        categorySlug: svc.categorySlug,
        serviceName: svc.name.trim(),
        confidence: cached.confidence ?? 0.7,
        reason: "",
      });
    }
  }

  // ---- 3. Ask the model ------------------------------------------------
  let result: MatchResult;
  let source: "model" | "fallback" = "model";
  let usage = { inputTokens: 0, outputTokens: 0 };
  try {
    const out = await classify(raw, flat);
    result = out.result;
    usage = { inputTokens: out.inputTokens, outputTokens: out.outputTokens };
  } catch (err) {
    source = "fallback";
    // Degrade rather than fail. The customer gets a worse suggestion, or the
    // browse link they'd have used anyway — never an error message about an
    // API they've never heard of.
    console.error("[service-match] classifier unavailable, falling back:", err);
    result = keywordFallback(raw, flat);
  }

  await withSite(site, (db) =>
    recordQuery(db, site.contractorId, normalized, raw, result, { source, ...usage })
  ).catch(() => {});

  // Which path produced this, visible in the response.
  //
  // Three different things all render as "we couldn't pin that down": the
  // model saying it doesn't know, the model being unreachable and the
  // keyword fallback finding nothing, and a bad response getting discarded.
  // Without this they're indistinguishable from the outside, which makes
  // debugging guesswork.
  //
  // Harmless to expose — it says which code path ran, not anything about
  // Elite or the customer.
  return NextResponse.json({ ...result, source, catalogSize: flat.length });
}

/**
 * The one provider-specific function.
 *
 * Kept to a single call so switching provider is editing this and nothing
 * else — same reasoning as the FSM integrations. The key is Elite's (and
 * later the platform's), never the contractor's: a contractor should not have
 * to open an account with an AI company to use a booking website.
 */
async function classify(
  text: string,
  services: { slug: string; name: string; shortDescription: string | null; categorySlug: string }[]
): Promise<{ result: MatchResult; inputTokens: number; outputTokens: number }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("no API key configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 700,
      messages: [{ role: "user", content: buildPrompt(text, services) }],
    }),
    // Someone waiting on a text box will not wait ten seconds. Past this,
    // the fallback is a better experience than a spinner.
    signal: AbortSignal.timeout(6000),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`classifier returned ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  const reply = (data.content ?? [])
    .map((c: { type: string; text?: string }) => (c.type === "text" ? c.text ?? "" : ""))
    .join("");

  // The raw reply, in the server log. If the model is answering but the
  // parser is rejecting it, this is the only place that shows the
  // difference — and the two look identical to the customer.
  console.log(`[service-match] "${text.slice(0, 60)}" -> ${reply.slice(0, 300)}`);

  return {
    result: parseResponse(reply, services),
    // Recorded rather than estimated. The per-query arithmetic said a
    // fraction of a cent, but arithmetic isn't measurement, and a business
    // case shouldn't rest on a figure nobody checked.
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}
