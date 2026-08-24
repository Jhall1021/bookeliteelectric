import type { PrismaClient } from "@prisma/client";

/**
 * "Tell us what you need" — turning a sentence into a service.
 *
 * The problem this solves isn't search. It's that homeowners don't know what
 * the work is called. "The light over my kitchen island" is a pendant. "My
 * outlet stopped working" is troubleshooting, not a replacement. A category
 * menu asks people to already know the answer.
 *
 * THREE STAGES, IN THIS ORDER, AND THE ORDER MATTERS
 *
 *   1. Safety screen — deterministic keywords, no model involved
 *   2. Cache — most sentences have been typed before
 *   3. Classification — the model, against the live catalog
 *
 * The safety screen runs FIRST and never calls anything. If the API is slow,
 * down, rate-limited or simply wrong, someone typing "burning smell from my
 * panel" still gets told to phone rather than being offered a booking. That
 * is not a thing to make probabilistic.
 *
 * A MATCH IS A SUGGESTION, NEVER A DESTINATION
 *
 * Nothing here navigates anyone anywhere. It returns a suggestion the
 * customer confirms, because choosing the service has price consequences —
 * describe a chandelier, get sent to Standard Light Fixture, and you've been
 * quoted $305 for a $530 job. A wrong guess a customer accepts silently is
 * worse than no guess at all.
 *
 * And it never pre-fills the question tree. Suggesting a service is
 * navigation. Answering "yes, there's attic access" because someone mentioned
 * an attic would be the model making a pricing decision from a sentence,
 * which is the thing this whole architecture exists to prevent.
 */

export type MatchResult =
  | { kind: "emergency"; matched: string[]; message: string }
  | { kind: "suggestion"; serviceSlug: string; categorySlug: string; serviceName: string; confidence: number; reason: string }
  | { kind: "out_of_scope"; message: string }
  | { kind: "unsure"; message: string };

/**
 * Phrases that mean "stop, phone us".
 *
 * Deliberately over-inclusive. A false positive costs one phone call that
 * might have been a booking. A false negative is someone booking a $250
 * outlet swap for an active fire hazard, three days out. Those are not
 * comparable, so this errs heavily toward catching.
 *
 * Phrases rather than single words where the single word is ambiguous:
 * "flickering" alone is usually a loose bulb, but a whole house flickering
 * is often a failing neutral, which is genuinely dangerous.
 */
const EMERGENCY_PATTERNS: { pattern: RegExp; why: string }[] = [
  { pattern: /\b(burn(ing|t|ed)?|smoke|smoking|smell.*(burn|smoke|electrical)|electrical smell)\b/i, why: "burning or smoke" },
  { pattern: /\b(spark(s|ing|ed)?|arc(ing|ed)?)\b/i, why: "sparking" },
  { pattern: /\b(shock(ed|ing|s)?|electrocut)/i, why: "electric shock" },
  { pattern: /\b(fire|flame|melt(ed|ing)?|scorch|charred?)\b/i, why: "fire or heat damage" },
  // Both word orders. "hot outlet" and "outlet is hot" are the same
  // report, and only one of them was being caught — people far more often
  // say the second.
  { pattern: /\b(hot|warm)\s+(outlet|receptacle|switch|breaker|panel|wire|cover|plug)/i, why: "something hot to the touch" },
  { pattern: /\b(outlet|receptacle|switch|breaker|panel|wire|cover|plug|plate)\b[^.]{0,20}\b(is|feels|gets|getting|was|really)\b[^.]{0,15}\b(hot|warm)\b/i, why: "something hot to the touch" },
  { pattern: /\b(buzz|hum)(ing)?\s*(sound|noise|from)?\s*(in|from|at)?\s*(the\s+)?(panel|breaker|box|outlet|switch)/i, why: "buzzing at the panel" },
  { pattern: /\bwater\s+(in|near|on|leak).*(panel|breaker|box|outlet)/i, why: "water near electrical equipment" },
  { pattern: /\b(whole|entire)\s+(house|home).*(flicker|dim|surg)/i, why: "whole-house flickering" },
  { pattern: /\bpanel\b.*\b(hot|burn|smell|spark|buzz|water)\b/i, why: "a problem at the panel" },
];

const EMERGENCY_MESSAGE =
  "What you're describing could be a safety issue, and it isn't something to book online for later. Please call us on 732-204-7003 and we'll talk it through now. If there's smoke, a burning smell, or anything is hot to the touch, switch off the breaker if you can reach it safely — and call 911 if you think there's a fire.";

/** Runs before anything else. No network, no model, no dependencies. */
export function screenForEmergency(text: string): { isEmergency: boolean; matched: string[] } {
  const matched = EMERGENCY_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.why);
  return { isEmergency: matched.length > 0, matched: [...new Set(matched)] };
}

/** Lowercased, punctuation stripped, whitespace collapsed — the cache key. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

/**
 * The last resort: match against service names when the model isn't available.
 *
 * Crude on purpose — it exists so an API outage degrades the feature to
 * something mediocre rather than to an error message. The customer never
 * learns anything went wrong; they just get a slightly worse suggestion, or
 * the browse link they'd have used anyway.
 */
export function keywordFallback(
  text: string,
  services: { slug: string; name: string; categorySlug: string }[]
): MatchResult {
  const words = new Set(normalize(text).split(" ").filter((w) => w.length > 3));
  if (words.size === 0) return { kind: "unsure", message: "" };

  let best: { svc: (typeof services)[0]; score: number } | null = null;
  for (const svc of services) {
    const nameWords = normalize(svc.name).split(" ");
    const score = nameWords.filter((w) => words.has(w)).length / Math.max(nameWords.length, 1);
    if (score > 0 && (!best || score > best.score)) best = { svc, score };
  }

  // A single shared word out of five isn't a match, it's a coincidence.
  if (!best || best.score < 0.34) return { kind: "unsure", message: "" };
  return {
    kind: "suggestion",
    serviceSlug: best.svc.slug,
    categorySlug: best.svc.categorySlug,
    serviceName: best.svc.name,
    confidence: Math.min(best.score, 0.6),
    reason: "",
  };
}

/**
 * What the model is asked.
 *
 * Built from the LIVE catalog rather than a fixed list, so a service added in
 * the admin is findable immediately with no deploy — and so this works for
 * the next contractor, whose catalog is different.
 */
export function buildPrompt(
  text: string,
  services: { slug: string; name: string; shortDescription: string | null }[]
): string {
  const catalog = services
    .map((s) => `${s.slug} | ${s.name.trim()}${s.shortDescription ? ` — ${s.shortDescription}` : ""}`)
    .join("\n");

  return `A homeowner has described what they need from a residential electrician. Match it to one service from the list, or say there is no good match.

SERVICES
${catalog}

WHAT THEY TYPED
"${text}"

Reply with JSON only, no other text:
{"slug": "the-service-slug" or null, "confidence": 0.0 to 1.0, "reason": "one short sentence, addressed to the homeowner", "outOfScope": true or false}

Guidance:
- outOfScope is true when this is real work but not on the list — generators, pools, commercial, solar, appliance repair. Better to say so than to offer the nearest thing.
- slug is null with outOfScope false when it IS probably on the list but you can't tell which. Being unsure is a fine answer.
- Confidence below 0.5 means you're guessing. Say so honestly; a wrong confident answer costs the homeowner money.
- Match on the WORK, not the words. "Light over my island" is a pendant, which is a standard light fixture. "Outlet stopped working" is troubleshooting, not replacement.`;
}

/** Parse the model's reply, tolerating the ways JSON tends to arrive. */
export function parseResponse(
  raw: string,
  services: { slug: string; name: string; categorySlug: string }[]
): MatchResult {
  let parsed: { slug?: string | null; confidence?: number; reason?: string; outOfScope?: boolean };
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: "unsure", message: "" };
  }

  if (parsed.outOfScope) {
    return {
      kind: "out_of_scope",
      message:
        "That's not something we handle through the website. Give us a call on 732-204-7003 and we'll let you know if we can help.",
    };
  }

  if (!parsed.slug) return { kind: "unsure", message: "" };

  // The model can only be trusted to return a slug that exists if we check.
  const svc = services.find((s) => s.slug === parsed.slug);
  if (!svc) return { kind: "unsure", message: "" };

  return {
    kind: "suggestion",
    serviceSlug: svc.slug,
    categorySlug: svc.categorySlug,
    serviceName: svc.name.trim(),
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0.5,
    reason: parsed.reason ?? "",
  };
}

/**
 * Record what was asked, and whether the suggestion was any good.
 *
 * The corpus is worth more than the feature. It shows which services are
 * named in words nobody uses, which work people want that isn't offered, and
 * where the matching is wrong — and it doubles as the cache.
 *
 * Never stores anything but the phrasing. No name, no address, no session.
 */
export async function recordQuery(
  prisma: PrismaClient,
  normalized: string,
  raw: string,
  result: MatchResult
) {
  const slug = result.kind === "suggestion" ? result.serviceSlug : null;
  await prisma.serviceQuery.upsert({
    where: { normalizedText: normalized },
    create: {
      normalizedText: normalized,
      rawExamples: [raw.slice(0, 200)],
      matchedServiceSlug: slug,
      confidence: result.kind === "suggestion" ? result.confidence : null,
      isEmergency: result.kind === "emergency",
      outOfScope: result.kind === "out_of_scope",
      timesAsked: 1,
    },
    update: {
      timesAsked: { increment: 1 },
      matchedServiceSlug: slug,
      confidence: result.kind === "suggestion" ? result.confidence : null,
    },
  });
}
