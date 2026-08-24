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

export type Candidate = { slug: string; name: string; categorySlug: string };

export type MatchResult =
  | { kind: "emergency"; matched: string[]; message: string }
  /**
   * Narrowed to a few, but one question short of certain.
   *
   * "Hang a light over my dining room table" is Replace Interior Light
   * Fixture or Install New Ceiling Light depending on whether there's one
   * there now — and those are different prices, so guessing is wrong.
   *
   * Being unsure was already handled. The mistake was that unsure had one
   * destination: the full service list. Sending someone to browse seventy
   * services when the answer is one of two, and the question that separates
   * them is "is there a light there now", is giving up in front of the
   * customer.
   */
  | { kind: "clarify"; question: string; candidates: Candidate[] }
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
/**
 * Words that appear in service names and tell you nothing.
 *
 * "remove and replace tv" matched "Remove and Replace Existing Microwave"
 * because two of its three words are in half the catalog. The word that
 * identified the job was the one carrying no weight at all.
 *
 * A match has to share something DISTINCTIVE, not something structural.
 */
const GENERIC_WORDS = new Set([
  "remove", "replace", "replacement", "install", "installation", "installed",
  "new", "existing", "and", "the", "a", "an", "my", "our", "your", "with",
  "for", "to", "in", "on", "of", "up", "need", "needs", "want", "get",
  "service", "add", "put", "fix", "change", "swap", "out", "please", "would",
  "like", "can", "you", "we", "is", "are", "it", "that", "this", "have",
]);

/** Everything meaningful in a string, however short. */
function contentWords(text: string): Set<string> {
  return new Set(
    normalize(text)
      .split(" ")
      // Length 2, not 4. "tv" and "ev" are the most identifying words a
      // customer can type, and a length filter threw both away — which is
      // how "remove and replace tv" ended up at a microwave.
      .filter((w) => w.length >= 2 && !GENERIC_WORDS.has(w))
  );
}

/**
 * The last resort: match against service names when the model isn't available.
 *
 * Crude on purpose — it exists so an API outage degrades the feature to
 * something mediocre rather than to an error. But mediocre has to mean
 * "no suggestion", never "confidently the wrong one": sending someone to
 * a $340 microwave job when they asked about a television is worse than
 * showing them the service list.
 */
export function keywordFallback(
  text: string,
  services: { slug: string; name: string; categorySlug: string }[]
): MatchResult {
  const asked = contentWords(text);
  if (asked.size === 0) return { kind: "unsure", message: "" };

  let best: { svc: (typeof services)[0]; overlap: number; score: number } | null = null;
  for (const svc of services) {
    const nameWords = contentWords(svc.name);
    if (nameWords.size === 0) continue;
    const shared = [...nameWords].filter((w) => asked.has(w));
    if (shared.length === 0) continue;
    // Scored against the DISTINCTIVE words in the name, so a long name full
    // of filler isn't penalised and a short one isn't flattered.
    const score = shared.length / nameWords.size;
    if (!best || score > best.score) best = { svc, overlap: shared.length, score };
  }

  // Nothing distinctive in common means no answer. This is the check that
  // was missing: "remove and replace tv" shares no content word with any
  // service name, so it should have returned unsure from the start.
  if (!best || best.overlap === 0 || best.score < 0.5) {
    return { kind: "unsure", message: "" };
  }

  return {
    kind: "suggestion",
    serviceSlug: best.svc.slug,
    categorySlug: best.svc.categorySlug,
    serviceName: best.svc.name,
    // Capped low on purpose. Without the model this is word overlap, not
    // understanding, and the UI shows "this might be" below 0.7.
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
{"slug": "the-service-slug" or null, "candidates": ["slug", "slug"] or null, "clarify": "a question" or null, "confidence": 0.0 to 1.0, "reason": "one short sentence, addressed to the homeowner", "outOfScope": true or false}

Work through these in order and stop at the first that applies:

1. NOT SOMETHING THIS LIST COVERS — generators, pools, solar, commercial,
   appliance repair. Set outOfScope true. Better to say so than offer the
   nearest thing.

2. ONE SERVICE CLEARLY FITS. Set slug. Match on the WORK, not the words:
   "light over my island" is a pendant, which is a standard light fixture.
   "outlet stopped working" is troubleshooting, not replacement.

3. TWO OR THREE COULD FIT AND ONE FACT WOULD DECIDE. This is the common case
   and you should expect to use it often. Set slug null, list them in
   candidates, and put the deciding fact in clarify as a question.

     "hang a light over my dining room table"
     -> the replace-a-fixture service and the new-light-location service
     -> "Is there a light fixture there now, or would this be a new spot?"

     "I need a new outlet in my garage"
     -> the standard outlet, the 240V garage outlet, the door-opener outlet
     -> "What will you be plugging in?"

   Ask only about what they can SEE. Is something there now, does it hang or
   sit flat, inside or outside, what will be plugged in. Never about wiring,
   boxes, circuits, amperage or anything behind a wall — they can't answer
   that and shouldn't have to.

4. NOTHING IN THE LIST IS CLOSE. Only now, slug null and candidates null.

Do not reach 4 because deciding was hard. A vague description is normally
case 3, not case 4 — the homeowner described their situation perfectly well,
it just maps to more than one of your services. Asking them one short question
is the right answer, and it's much better than sending them to browse seventy
services.

Confidence below 0.5 means you're guessing — prefer case 3 over a guess.`;
}

/** Parse the model's reply, tolerating the ways JSON tends to arrive. */
export function parseResponse(
  raw: string,
  services: { slug: string; name: string; categorySlug: string }[]
): MatchResult {
  let parsed: {
    slug?: string | null;
    candidates?: string[] | null;
    clarify?: string | null;
    confidence?: number;
    reason?: string;
    outOfScope?: boolean;
  };
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

  // Two or three candidates plus the question that separates them. Checked
  // before the unsure path, since this is the better answer whenever it's
  // available.
  if (parsed.clarify && parsed.candidates?.length) {
    const found = parsed.candidates
      .map((slug) => services.find((s) => s.slug === slug))
      .filter((s): s is (typeof services)[number] => !!s)
      .slice(0, 3)
      .map((s) => ({ slug: s.slug, name: s.name.trim(), categorySlug: s.categorySlug }));
    if (found.length >= 2) {
      return { kind: "clarify", question: parsed.clarify, candidates: found };
    }
    // Exactly one survived, so the others were slugs that don't exist. The
    // question no longer makes sense with a single option — but the one real
    // candidate is still a better answer than sending someone to browse
    // seventy services because a slug was mistyped.
    if (found.length === 1) {
      return {
        kind: "suggestion",
        serviceSlug: found[0].slug,
        categorySlug: found[0].categorySlug,
        serviceName: found[0].name,
        // Low: this is the salvage of a partly-wrong answer, and the UI
        // shows "this might be" rather than "this sounds like".
        confidence: 0.4,
        reason: parsed.reason ?? "",
      };
    }
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
  // A clarify isn't cached as a match — the whole point is that we don't
  // know which service it is yet, and caching one of the candidates would
  // turn "we asked" into "we guessed" on the next person to type it.
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
