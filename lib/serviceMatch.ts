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
  | { kind: "unsure"; message: string }
  /**
   * More than one job in one sentence.
   *
   * "An outlet for a phone charger in my bedroom and a new dining room light"
   * is two services, and the finder used to have nowhere to put that. The
   * nearest available answer was clarify — two candidate buttons, one of
   * which the customer picks — which quietly dropped half the request while
   * looking like a confident answer.
   *
   * Worse than dropping it: booked separately, two jobs pay two service-call
   * minimums. Two half-hour jobs are $375 on one visit and $500 on two.
   *
   * Each item is resolved independently, so a request that's one real service
   * and one thing Elite doesn't do comes back as exactly that rather than
   * collapsing to whichever half was easier.
   */
  | { kind: "multi"; items: MatchItem[] }
  /**
   * A punch list. Past three, resolving each one through a text box is worse
   * than the service list, so this points there instead of returning nine
   * half-confident guesses.
   */
  | { kind: "too_many"; count: number; message: string };

/**
 * One job within a multi-service request.
 *
 * `label` is the customer's own words for this part, so the answer can be
 * shown against what they asked for rather than against a service name they
 * never used.
 */
export type MatchItem =
  | { kind: "suggestion"; label: string; serviceSlug: string; categorySlug: string; serviceName: string; confidence: number; reason: string }
  | { kind: "clarify"; label: string; question: string; candidates: Candidate[] }
  | { kind: "out_of_scope"; label: string; message: string }
  | { kind: "unsure"; label: string };

/** Past this, the service list is a better tool than a text box. */
export const MAX_INTENTS = 3;

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
  "What you're describing could be a safety issue, and it isn't something to book online for later. Please call us now and we'll talk it through. If there's smoke, a burning smell, or anything is hot to the touch, switch off the breaker if you can reach it safely — and call 911 if you think there's a fire.";

/** Runs before anything else. No network, no model, no dependencies. */
export function screenForEmergency(text: string): { isEmergency: boolean; matched: string[] } {
  const matched = EMERGENCY_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.why);
  return { isEmergency: matched.length > 0, matched: [...new Set(matched)] };
}

/**
 * Remove anything that identifies a person before it's stored.
 *
 * People put their address in a search box. And their phone number, because
 * a box that says "tell us what you need" reads like a contact form to
 * plenty of them.
 *
 * The corpus is worth keeping — it's how we learn what homeowners call
 * things. None of that value depends on knowing who typed it, so the
 * identifying parts come out before anything is written down. Done at the
 * point of storage rather than trusting every future reader of the table.
 */
export function stripIdentifiers(text: string): string {
  return text
    .replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, "[phone]")
    .replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/gi, "[email]")
    // House number plus a street word. Catches "12 Oak Street"; leaves
    // "12 recessed lights" alone.
    .replace(
      /\b\d{1,5}\s+[\w\s]{1,25}\b(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|circle|cir|boulevard|blvd|way|place|pl|terrace|ter)\b\.?/gi,
      "[address]"
    )
    .trim();
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

  return `A homeowner has described what they need from a residential electrician. Work out how many separate jobs they've described, then match each one to a service from the list.

SERVICES
${catalog}

WHAT THEY TYPED
"${text}"

Reply with JSON only, no other text:
{"items": [{"label": "their words for this job", "slug": "the-service-slug" or null, "candidates": ["slug", "slug"] or null, "clarify": "a question" or null, "confidence": 0.0 to 1.0, "reason": "one short sentence, addressed to the homeowner", "outOfScope": true or false}], "distinctJobs": 1}

HOW MANY JOBS

Most requests are one job and produce one item. Some are two or three.

  "an outlet for a phone charger in my bedroom and a new dining room light"
  -> TWO. Different work in different rooms.

  "install an outlet and a switch in my bedroom"
  -> TWO. An outlet and a switch are separate work even in one room.

  "replace the three broken outlets in my kitchen"
  -> ONE. Same work repeated. Quantity is chosen later, not here.

  "my kitchen lights flicker and the outlets by the sink are dead"
  -> ONE. Two symptoms of what is probably one fault. Troubleshooting covers
     it, and splitting symptoms would sell two visits for one problem.

Split on DIFFERENT WORK — never on different rooms, several fittings of the
same kind, or several symptoms of one fault. When you can't tell, prefer
FEWER items. A customer can always add another service; being sold two jobs
for one piece of work is worse.

Set distinctJobs to how many you found. If it is more than ${MAX_INTENTS},
say so in distinctJobs and return an empty items array — a longer list is
handled better by the full service list than by this.

FOR EACH JOB

Put the homeowner's own words for that part in label — five words or so,
taken from what they typed. Then work through these in order and stop at the
first that applies:

1. NOT SOMETHING THIS LIST COVERS — generators, pools, solar, commercial,
   appliance repair. Set outOfScope true. Better to say so than offer the
   nearest thing.

2. ONE SERVICE CLEARLY FITS. Set slug. Match on the WORK, not the words:
   "light over my island" is a pendant, which is a standard light fixture.
   "outlet stopped working" is troubleshooting, not replacement.

   When they say what they're plugging in, that decides it. A fridge, freezer,
   air conditioner, microwave, space heater or shop equipment needs its own
   circuit — that's the dedicated circuit service, not the standard outlet.
   An outlet for a lamp or a TV is the standard one.

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

Confidence below 0.5 means you're guessing — prefer case 3 over a guess.

These four cases apply to each job SEPARATELY. One job being out of scope
says nothing about the other: "put in a bedroom outlet and service my
generator" is one real service and one we don't do, and both belong in the
answer. Never drop a job because another one was easier to place.`;
}

/** One job as the model described it, before it's been checked against the catalog. */
type RawItem = {
  label?: string | null;
  slug?: string | null;
  candidates?: string[] | null;
  clarify?: string | null;
  confidence?: number;
  reason?: string;
  outOfScope?: boolean;
};

type CatalogService = { slug: string; name: string; categorySlug: string };

/**
 * Resolve ONE job against the catalog.
 *
 * The whole of the old single-service logic, unchanged in behavior and now
 * shared: a one-job request runs through this and is returned in exactly the
 * shape it always was, so every existing path in the UI keeps working.
 */
function parseItem(item: RawItem, services: CatalogService[], fallbackLabel: string): MatchItem {
  const label = (item.label ?? "").trim() || fallbackLabel;

  if (item.outOfScope) {
    return {
      kind: "out_of_scope",
      label,
      message:
        "That's not something we handle through the website. Give us a call and we'll let you know if we can help.",
    };
  }

  // Two or three candidates plus the question that separates them. Checked
  // before the unsure path, since this is the better answer whenever it's
  // available.
  if (item.clarify && item.candidates?.length) {
    const found = item.candidates
      .map((slug) => services.find((s) => s.slug === slug))
      .filter((s): s is CatalogService => !!s)
      .slice(0, 3)
      .map((s) => ({ slug: s.slug, name: s.name.trim(), categorySlug: s.categorySlug }));
    if (found.length >= 2) {
      return { kind: "clarify", label, question: item.clarify, candidates: found };
    }
    // Exactly one survived, so the others were slugs that don't exist. The
    // question no longer makes sense with a single option — but the one real
    // candidate is still a better answer than sending someone to browse
    // seventy services because a slug was mistyped.
    if (found.length === 1) {
      return {
        kind: "suggestion",
        label,
        serviceSlug: found[0].slug,
        categorySlug: found[0].categorySlug,
        serviceName: found[0].name,
        // Low: this is the salvage of a partly-wrong answer, and the UI
        // shows "this might be" rather than "this sounds like".
        confidence: 0.4,
        reason: item.reason ?? "",
      };
    }
  }

  if (!item.slug) return { kind: "unsure", label };

  // The model can only be trusted to return a slug that exists if we check.
  const svc = services.find((s) => s.slug === item.slug);
  if (!svc) return { kind: "unsure", label };

  return {
    kind: "suggestion",
    label,
    serviceSlug: svc.slug,
    categorySlug: svc.categorySlug,
    serviceName: svc.name.trim(),
    confidence: typeof item.confidence === "number" ? item.confidence : 0.5,
    reason: item.reason ?? "",
  };
}

/** Drop the per-item label to get back the original single-service shape. */
function asSingle(item: MatchItem): MatchResult {
  switch (item.kind) {
    case "suggestion":
      return {
        kind: "suggestion",
        serviceSlug: item.serviceSlug,
        categorySlug: item.categorySlug,
        serviceName: item.serviceName,
        confidence: item.confidence,
        reason: item.reason,
      };
    case "clarify":
      return { kind: "clarify", question: item.question, candidates: item.candidates };
    case "out_of_scope":
      return { kind: "out_of_scope", message: item.message };
    case "unsure":
      return { kind: "unsure", message: "" };
  }
}

/**
 * Parse the model's reply, tolerating the ways JSON tends to arrive.
 *
 * Accepts both shapes. The current prompt asks for {items:[...]}; a reply in
 * the older single-object form is read as one item, so a cached response or a
 * model that ignores the new instruction still resolves rather than dropping
 * to unsure.
 *
 * A single job comes back in exactly the shape it always did. Only a genuine
 * multi-job request produces the new kind, which is what keeps this from
 * being a rewrite of every path in the UI.
 */
export function parseResponse(raw: string, services: CatalogService[]): MatchResult {
  let parsed: { items?: RawItem[]; distinctJobs?: number } & RawItem;
  try {
    const cleaned = raw.replace(/```json|```/g, "").trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return { kind: "unsure", message: "" };
  }

  const distinct =
    typeof parsed.distinctJobs === "number" ? parsed.distinctJobs : undefined;

  // A punch list. Reported even though items is empty, so the customer is
  // told what happened rather than shown a shrug.
  if (distinct !== undefined && distinct > MAX_INTENTS) {
    return {
      kind: "too_many",
      count: distinct,
      message:
        `That's ${distinct} separate jobs — more than this box handles well. ` +
        `The full list is easier for a job like that, and everything you pick ` +
        `goes onto the same visit.`,
    };
  }

  // Older single-object shape.
  const rawItems: RawItem[] = Array.isArray(parsed.items)
    ? parsed.items
    : [parsed as RawItem];

  const items = rawItems
    .slice(0, MAX_INTENTS)
    .map((it, i) => parseItem(it, services, `Part ${i + 1}`));

  if (items.length === 0) return { kind: "unsure", message: "" };
  if (items.length === 1) return asSingle(items[0]);

  // Two identical suggestions mean the model split one job in half. Collapse
  // rather than offering the same service twice — quantity is chosen in the
  // flow, not here.
  const slugs = new Set(
    items.filter((i) => i.kind === "suggestion").map((i) => (i as { serviceSlug: string }).serviceSlug)
  );
  const allSameService =
    items.every((i) => i.kind === "suggestion") && slugs.size === 1;
  if (allSameService) return asSingle(items[0]);

  return { kind: "multi", items };
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
  db: PrismaClient,
  contractorId: string,
  normalized: string,
  raw: string,
  result: MatchResult,
  meta?: { source?: string; inputTokens?: number; outputTokens?: number }
) {
  const slug = result.kind === "suggestion" ? result.serviceSlug : null;
  // A clarify isn't recorded as a match — the whole point is that we don't
  // know which service it is yet, and caching one of the candidates would
  // turn "we asked" into "we guessed" for the next person who types it.
  //
  // A multi isn't either, and for a sharper reason: the cache is keyed on
  // normalized text and returns ONE slug. Storing a two-job request against
  // whichever service came first would mean the next person to phrase it the
  // same way is silently served half their request, straight from cache,
  // without the model ever running. The `slug` line above already yields null
  // for it — this note is here so it stays that way.
  const outcome = {
    suggestion: "SUGGESTED",
    clarify: "CLARIFIED",
    emergency: "EMERGENCY",
    out_of_scope: "OUT_OF_SCOPE",
    unsure: "BROWSE",
    multi: "MULTI",
    too_many: "TOO_MANY",
  }[result.kind];

  // ADR-008: keyed on (contractorId, normalizedText). It was keyed on the
  // phrase alone, which meant a second contractor's write UPDATED the first
  // contractor's row — matched slug, confidence, outcome, source, rawExamples
  // and the token counters, which are cost attribution.
  await db.serviceQuery.upsert({
    where: { contractorId_normalizedText: { contractorId, normalizedText: normalized } },
    create: {
      contractorId,
      normalizedText: normalized,
      rawExamples: [stripIdentifiers(raw).slice(0, 200)],
      matchedServiceSlug: slug,
      confidence: result.kind === "suggestion" ? result.confidence : null,
      isEmergency: result.kind === "emergency",
      outOfScope: result.kind === "out_of_scope",
      outcome,
      source: meta?.source ?? "fallback",
      totalInputTokens: meta?.inputTokens ?? 0,
      totalOutputTokens: meta?.outputTokens ?? 0,
      timesAsked: 1,
    },
    update: {
      timesAsked: { increment: 1 },
      matchedServiceSlug: slug,
      confidence: result.kind === "suggestion" ? result.confidence : null,
      outcome,
      source: meta?.source ?? "fallback",
      totalInputTokens: { increment: meta?.inputTokens ?? 0 },
      totalOutputTokens: { increment: meta?.outputTokens ?? 0 },
    },
  });
}
