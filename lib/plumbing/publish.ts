/**
 * The canonical Plumbing catalog, as rows the platform can install.
 *
 * WHY THIS EXISTS
 *
 * Electrical Template V1 was EXTRACTED from Elite's live catalog, so its
 * TemplateVersion rows were written by the extractor. Plumbing was AUTHORED —
 * there is no plumbing contractor to extract from — so something has to turn
 * lib/plumbing into the same rows. This is that something, and it is the only
 * adapter the frozen architecture needs.
 *
 * PURE. No database, no clock, no network. It returns a PAYLOAD; a caller
 * writes it. That split is what lets the whole catalog be proved offline —
 * scripts/verify-plumbing-template.ts checks this payload with no connection —
 * and it keeps the decision of WHERE to write entirely outside the template.
 *
 * IT GOES THROUGH composeAll(), NOT service.families
 *
 * The composition rules (one authoritative producer per fact, every gate input
 * reachable) are only visible in the assembled tree. A publisher that walked
 * families itself would be the second assembler those rules exist to prevent,
 * and it would reintroduce both defects on its own schedule.
 *
 * NO ECONOMICS, STILL
 *
 * Nothing below carries a price, rate, cost, allowance or boundary. Band
 * answers ship with their {b1} holes intact and their policy recorded, exactly
 * as the electrical template does, so a contractor supplies their own numbers
 * or the service cannot publish.
 */

import { PLUMBING_SERVICES, PLUMBING_CATEGORIES, type PlumbingService } from "./catalog";
import { composeAll, type ComposedService } from "./composition";
import { PLUMBING_POLICIES } from "./policies";
import {
  COMBUSTION_SCOPE, CONDITION_SCOPE, PIPE_MATERIAL_SCOPE, SHUTOFF_SCOPE,
  componentsForAnswer, requiredRolesAcross, type ScopeConsequence,
} from "./mappings";
import { PLUMBING_TEMPLATE_TRADE, PLUMBING_TEMPLATE_VERSION } from "./index";

/** Mirrors TemplateVersionKind. A plumbing V1 is a complete catalog state. */
/**
 * Roles the mappings declare that no mechanism can carry yet.
 *
 * COPPER and PEX attach no component — joining copper to copper is the job,
 * not an addition to it — so their fittings have no component recipe to ride,
 * and the intersection rule correctly keeps them off the service because a
 * copper job does not consume PEX rings. They are therefore declared, used by
 * lib/plumbing/scope.ts at runtime, and invisible to readiness.
 *
 * Listed rather than quietly tolerated. The verifier asserts this set EXACTLY,
 * so a fifth orphan is a failure rather than a slow leak, and closing the gap
 * is a deliberate V2 decision — it needs a canonical component for the
 * like-for-like joint, which is catalog expansion and out of scope here.
 */
export const ROLES_WITHOUT_A_CARRIER: readonly string[] = [
  "copper_fitting", "pex_fitting", "pex_ring", "solder_or_press_consumable",
];

export type TemplateKind = "SNAPSHOT" | "DELTA";

export type CanonicalRow = { key: string; name: string };

export type TemplateOptionRow = {
  value: string;
  label: string;
  routeAction: string;
  order: number;
  requiredPhotoLabels: string[];
  photosBlockBooking: boolean;
  nextQuestionKey: string | null;
  /** Set only on a band answer; the hole is still in `label`. */
  labelPattern: string | null;
  policyKey: string | null;
  /** Canonical components THIS answer selects. Identity only, never a price. */
  componentKeys: string[];
};

export type TemplateQuestionRow = {
  key: string;
  prompt: string;
  helpText: string | null;
  inputType: string;
  order: number;
  options: TemplateOptionRow[];
};

export type TemplateServiceRow = {
  key: string;
  slug: string;
  name: string;
  shortDescription: string;
  canonicalCategorySlug: string;
  bookingType: string;
  photoState: string;
  isPrimaryEligible: boolean;
  requiresTechCount: number;
  questions: TemplateQuestionRow[];
  /** Policies the SERVICE needs that no question introduces. */
  policyKeys: string[];
  /**
   * Roles this service consumes on EVERY path, with the quantity the job uses.
   *
   * Quantity is a count of the thing the work consumes — one flex connector,
   * one stop valve — not an allowance somebody chose, which is why it may sit
   * in a canonical template at all. What the role COSTS is the contractor's,
   * and a service whose contractor has not costed it cannot publish a price.
   */
  materialRoles: { key: string; quantity: number }[];
};

export type PlumbingPublishPayload = {
  trade: string;
  version: number;
  kind: TemplateKind;
  notes: string;
  categories: { slug: string; name: string }[];
  policies: { key: string; type: string; unit: string | null; boundaryCount: number; prompt: string }[];
  services: TemplateServiceRow[];
  /** Canonical identity the catalog references. Created with NO cost. */
  materials: CanonicalRow[];
  components: CanonicalRow[];
  /** componentKey -> the roles that component consumes. Identity, not cost. */
  componentMaterials: { componentKey: string; materialKeys: string[] }[];
};

/** A role key to a human name, without inventing a product or a price. */
function humanize(key: string): string {
  return key.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/**
 * Every canonical material role and component key the catalog can reach.
 *
 * Collected from the MAPPINGS rather than listed by hand, because the mappings
 * are what the scope layer actually consumes. A hand-kept list would drift and
 * the drift would show up as a provisioning failure on one unlucky route.
 */
export function referencedCanonicalKeys(): { materials: string[]; components: string[] } {
  const materials = new Set<string>();
  const components = new Set<string>();
  for (const table of [COMBUSTION_SCOPE, SHUTOFF_SCOPE, PIPE_MATERIAL_SCOPE, CONDITION_SCOPE])
    for (const consequence of Object.values(table)) {
      for (const r of consequence.materialRoles) materials.add(r);
      for (const c of consequence.components) components.add(c);
    }
  return { materials: [...materials].sort(), components: [...components].sort() };
}



/**
 * What each canonical COMPONENT physically consumes.
 *
 * The branch half of the material split. A role only one configuration needs —
 * PVC vent pipe for a power vent, a metal flue connector for an atmospheric —
 * cannot sit on the service, because the service does not always need it, and
 * the intersection rule correctly excludes it. Left there it would reach
 * nothing at all, which is exactly where four roles were stranded before this.
 *
 * So it rides the COMPONENT that branch attaches, through the platform's
 * existing CanonicalComponentMaterial recipe. Selecting the branch selects the
 * component, and the component's recipe is what makes the role visible to
 * readiness and pricing — `materialRecipe: { cents, resolved }` in
 * lib/pricing.ts, which fails closed when the contractor has not costed it.
 *
 * The recipe is what is DISTINCTIVE to that branch: the entry's roles minus
 * what every component-bearing sibling also needs. What the siblings share is
 * not branch-specific and belongs to the service.
 */
export function componentRecipes(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const table of [COMBUSTION_SCOPE, SHUTOFF_SCOPE, PIPE_MATERIAL_SCOPE, CONDITION_SCOPE]) {
    const entries = Object.entries(table as Record<string, ScopeConsequence>)
      .filter(([v]) => v !== "UNKNOWN");
    const siblings = entries.filter(([, c]) => c.components.length > 0);
    if (siblings.length === 0) continue;
    // Shared across EVERY value the fact can take, not only the ones that
    // attach a component. A stop valve is needed by "failed" and "absent" but
    // not by "working", so it is branch-specific even though both
    // component-bearing branches want it — intersecting only those two would
    // have called it shared and stranded it.
    let shared = [...entries[0][1].materialRoles];
    for (const [, c] of entries.slice(1)) shared = shared.filter((r: string) => c.materialRoles.includes(r));
    for (const [, c] of siblings) {
      const distinctive = c.materialRoles.filter((r) => !shared.includes(r));
      for (const key of c.components) {
        const existing = out.get(key) ?? [];
        for (const r of distinctive) if (!existing.includes(r)) existing.push(r);
        out.set(key, existing);
      }
    }
  }
  return out;
}

/** Every component a service's answers can reach. */
function componentsReachableFrom(svc: PlumbingService): string[] {
  const out = new Set<string>();
  for (const q of composeAll([svc])[0].questions)
    for (const o of q.options)
      if (o.establishes) for (const c of componentsForAnswer(o.establishes.factKey, o.establishes.value)) out.add(c);
  return [...out];
}

/**
 * The roles a service consumes whatever the homeowner answers.
 *
 * Intersection per fact family, then the union across families. A role that
 * only some answers reach is carried by the COMPONENT on that answer instead,
 * which is the split TemplateServiceMaterial and TemplateAnswerOptionComponent
 * already draw — one for what the job always needs, one for what a branch adds.
 *
 * `existing_condition` contributes nothing and is not consulted. Its mapping is
 * effect-free by design and must stay that way: an observation may not select
 * work, and adding it here would be exactly that, through a different door.
 */
function requiredRolesFor(svc: PlumbingService): string[] {
  const out: string[] = [];
  const add = (roles: string[]) => { for (const r of roles) if (!out.includes(r)) out.push(r); };

  if (svc.expectsCombustion)
    add(requiredRolesAcross(COMBUSTION_SCOPE as never, svc.expectsCombustion));
  if (svc.families.includes("shutoff_condition"))
    add(requiredRolesAcross(SHUTOFF_SCOPE as never, ["PRESENT_WORKING", "PRESENT_FAILED", "ABSENT"]));
  if (svc.families.includes("pipe_material"))
    // GALVANIZED and CAST_IRON leave the fixed-price path, so they are not
    // paths this service must be costed for.
    add(requiredRolesAcross(PIPE_MATERIAL_SCOPE as never, ["COPPER", "PEX", "CPVC"]));

  // Never both. A role carried by a component this service can reach is
  // already costed through that component's recipe; requiring it at service
  // level too would put two of it on the same job. The component wins, because
  // it is the one that knows which branch was actually chosen.
  const recipes = componentRecipes();
  const viaComponent = new Set(componentsReachableFrom(svc).flatMap((c) => recipes.get(c) ?? []));
  return out.filter((r) => !viaComponent.has(r));
}

function serviceRow(svc: PlumbingService, composed: ComposedService): TemplateServiceRow {
  return {
    key: svc.key,
    // Slug equals key for an authored template. Electrical's diverge only
    // because Elite's slugs were live URLs before the template existed.
    slug: svc.key,
    name: svc.name,
    shortDescription: svc.shortDescription,
    canonicalCategorySlug: svc.category,
    bookingType: svc.bookingType,
    photoState: svc.metadata.photo,
    isPrimaryEligible: svc.metadata.visit === "PRIMARY_ELIGIBLE",
    requiresTechCount: svc.requiresTechCount ?? 1,
    policyKeys: [...(svc.servicePolicies ?? [])],
    materialRoles: requiredRolesFor(svc).map((key) => ({ key, quantity: 1 })),
    questions: composed.questions.map((q) => ({
      key: q.key,
      prompt: q.prompt,
      helpText: q.helpText ?? null,
      inputType: q.inputType,
      order: q.order,
      options: q.options.map((o, i) => ({
        value: o.value,
        // A band answer's label IS the pattern, holes and all. The resolver
        // fills it once the contractor answers the policy, and publication is
        // blocked until then — the template never ships a number somebody
        // chose.
        label: o.label ?? o.labelPattern!,
        routeAction: o.routeAction,
        order: i,
        requiredPhotoLabels: [...(o.requiredPhotoLabels ?? [])],
        photosBlockBooking: o.photosBlockBooking ?? true,
        nextQuestionKey: o.nextQuestionKey ?? null,
        labelPattern: o.labelPattern ?? null,
        policyKey: o.labelPattern ? q.policyKey ?? null : null,
        // Read from the mapping, never declared per option, so an answer
        // cannot claim to select a component the scope layer does not attach.
        componentKeys: o.establishes
          ? [...componentsForAnswer(o.establishes.factKey, o.establishes.value)]
          : [],
      })),
    })),
  };
}

/**
 * Build the whole payload, or throw.
 *
 * Refuses as a WHOLE, inherited from composeAll: a catalog where one service
 * cannot compose is not a catalog to publish 62 services from and skip the
 * 63rd. This is the first of the two places partial installation is made
 * impossible; the second is installCatalog's transaction, which is the
 * platform's and which plumbing does not reimplement.
 */
export function buildPlumbingPayload(): PlumbingPublishPayload {
  const composed = composeAll(PLUMBING_SERVICES);
  const byKey = new Map(composed.map((c) => [c.serviceKey, c]));
  const { materials, components } = referencedCanonicalKeys();

  return {
    trade: PLUMBING_TEMPLATE_TRADE,
    version: PLUMBING_TEMPLATE_VERSION,
    // A complete installable catalog state — everything the trade offers.
    kind: "SNAPSHOT",
    notes: `Plumbing Template V1 — ${PLUMBING_SERVICES.length} canonical services, authored rather than extracted.`,
    categories: PLUMBING_CATEGORIES.map((c) => ({ slug: c.key, name: c.name })),
    policies: PLUMBING_POLICIES.map((p) => ({
      key: p.key, type: p.type, unit: p.unit, boundaryCount: p.boundaryCount, prompt: p.prompt,
    })),
    services: PLUMBING_SERVICES.map((s) => serviceRow(s, byKey.get(s.key)!)),
    materials: materials.map((key) => ({ key, name: humanize(key) })),
    components: components.map((key) => ({ key, name: humanize(key) })),
    componentMaterials: [...componentRecipes()]
      .filter(([, roles]) => roles.length > 0)
      .map(([componentKey, materialKeys]) => ({ componentKey, materialKeys })),
  };
}

export type PayloadTotals = {
  services: number; questions: number; options: number;
  policies: number; categories: number; materials: number; components: number;
  bandOptions: number;
  serviceMaterials: number;
  optionComponents: number;
  componentMaterials: number;
};

export function payloadTotals(p: PlumbingPublishPayload): PayloadTotals {
  const questions = p.services.flatMap((s) => s.questions);
  const options = questions.flatMap((q) => q.options);
  return {
    services: p.services.length,
    questions: questions.length,
    options: options.length,
    policies: p.policies.length,
    categories: p.categories.length,
    materials: p.materials.length,
    components: p.components.length,
    bandOptions: options.filter((o) => o.labelPattern !== null).length,
    serviceMaterials: p.services.reduce((n, s) => n + s.materialRoles.length, 0),
    optionComponents: options.reduce((n, o) => n + o.componentKeys.length, 0),
    componentMaterials: p.componentMaterials.reduce((n, c) => n + c.materialKeys.length, 0),
  };
}
