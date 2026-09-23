/**
 * The decisions Routing V2 needs and refuses to make.
 *
 * These are TemplatePolicyDefinitions, not new infrastructure, because the
 * existing policy model already says exactly the right thing: "A decision the
 * template knows must be made, and refuses to make", and "Unresolved is the
 * honest starting state and is NOT zero". A conductor specification and a
 * termination slack allowance are that, precisely.
 *
 * They attach to the template SERVICE, which is how `installCatalog` finds
 * them — so a contractor provisioned tomorrow receives all three as empty,
 * unresolved rows, and receives nobody's answers.
 *
 * The template holds the SET of valid conductor specifications, because which
 * gauges exist is trade knowledge. It holds no default, because which one a
 * contractor works to is theirs.
 */
import { PrismaClient, TemplatePolicyType } from "@prisma/client";
import { POLICY_KEYS, CONDUCTOR_SPEC_CHOICES } from "../lib/electrical/surfaceSystemConfiguration";
import { CONCEALED_BRANCH_CABLE_CHOICES, CONCEALED_ROUTE_POLICY_KEYS } from "../lib/electrical/concealedRouteMaterialConfiguration";
import { CONNECTED_DEVICE_COMMISSIONING_CHOICES, CONNECTED_DEVICE_POLICY_KEYS } from "../lib/electrical/connectedDeviceLaborFacts";

const prisma = new PrismaClient();

/** Each declaration is linked only to services whose physical path consumes it. */
const SURFACE_SERVICE_KEYS = [
  "surface-mounted-outlet", "surface-mounted-switch", "surface-mounted-fixture-box",
  "new-120v-outlet",
];
const CONCEALED_SERVICE_KEYS = [
  "new-120v-outlet", "rv2-fixture-accessible-outlet", "rv2-fixture-accessible-switch",
  "rv2-fixture-back-to-back-outlet", "rv2-fixture-finished-wall-outlet",
];
const CIRCUIT_SERVICE_KEYS = [
  "dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-240v-appliance-circuit",
];

type Def = {
  key: string; type: TemplatePolicyType; unit: string | null;
  prompt: string; choices: string[]; serviceKeys: string[];
};

export const ROUTING_V2_POLICY_DEFINITIONS: Def[] = [
  {
    key: CONNECTED_DEVICE_POLICY_KEYS.commissioning,
    type: TemplatePolicyType.MATERIAL_SPECIFICATION,
    unit: null,
    prompt: "When you install a compatible connected device, does your standard service include connecting and commissioning it in the customer's app?",
    choices: [...CONNECTED_DEVICE_COMMISSIONING_CHOICES],
    serviceKeys: [
      "customer-supplied-smart-switch", "smart-outlet-upgrade", "smart-thermostat-install",
      "video-doorbell-existing-wiring", "floodlight-camera-existing",
    ],
  },
  {
    key: POLICY_KEYS.conductorSpec,
    type: TemplatePolicyType.MATERIAL_SPECIFICATION,
    unit: null,
    prompt:
      "Which conductor specification do you run for a surface branch extension on this service? This service only ever extends an existing general-purpose branch circuit for an everyday load, so one specification covers every job it accepts.",
    choices: [...CONDUCTOR_SPEC_CHOICES],
    serviceKeys: SURFACE_SERVICE_KEYS,
  },
  {
    key: POLICY_KEYS.terminationSlack,
    type: TemplatePolicyType.MEASUREMENT,
    unit: "ft",
    prompt:
      "How much extra conductor do you allow at each termination? Enter 0 if you deliberately model no additional allowance — leaving it blank means you have not decided, which is different.",
    choices: [],
    serviceKeys: SURFACE_SERVICE_KEYS,
  },
  {
    key: POLICY_KEYS.offcutReuse,
    type: TemplatePolicyType.MATERIAL_SPECIFICATION,
    unit: null,
    prompt:
      "When a run is cut into several legs, do you plan on reusing the offcut from one leg on another? This decides whether a 1+1+29 ft route buys seven pieces or eight.",
    choices: ["REUSE_ACROSS_LEGS", "NO_REUSE_ACROSS_LEGS"],
    serviceKeys: SURFACE_SERVICE_KEYS,
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.cableRole,
    type: TemplatePolicyType.MATERIAL_SPECIFICATION,
    unit: null,
    prompt: "Which jacketed branch-cable role do you use for the accepted everyday-load extension scope? Price2Book will not infer the cable from a homeowner answer.",
    choices: [...CONCEALED_BRANCH_CABLE_CHOICES],
    serviceKeys: CONCEALED_SERVICE_KEYS,
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination,
    type: TemplatePolicyType.MEASUREMENT,
    unit: "ft",
    prompt: "How much extra cable do you carry at each end of a measured concealed branch route? Enter 0 only if that is your deliberate estimating rule.",
    choices: [],
    serviceKeys: [...CONCEALED_SERVICE_KEYS, ...CIRCUIT_SERVICE_KEYS],
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.backToBackCableAllowance,
    type: TemplatePolicyType.MEASUREMENT,
    unit: "ft",
    prompt: "How many feet of cable do you carry for a confirmed straight-through, back-to-back wall extension? This is a contractor allowance, not a homeowner measurement.",
    choices: [],
    serviceKeys: CONCEALED_SERVICE_KEYS,
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.supportSpacing,
    type: TemplatePolicyType.MEASUREMENT,
    unit: "ft",
    prompt: "For accessible attic, basement, or crawlspace runs, what support spacing do you use for estimating the selected jacketed cable?",
    choices: [],
    serviceKeys: [...CONCEALED_SERVICE_KEYS, ...CIRCUIT_SERVICE_KEYS],
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination,
    type: TemplatePolicyType.MATERIAL_SPECIFICATION,
    unit: null,
    prompt: "For estimating accessible concealed routes, do you include one additional cable support at each termination?",
    choices: ["YES", "NO"],
    serviceKeys: [...CONCEALED_SERVICE_KEYS, ...CIRCUIT_SERVICE_KEYS],
  },
  {
    key: CONCEALED_ROUTE_POLICY_KEYS.drywallFramingSpacing,
    type: TemplatePolicyType.MEASUREMENT, unit: "in",
    prompt: "What framing interval should Price2Book use to estimate access openings for a clear horizontal drywall route? The published suggestion is 16 inches, but use your field rule.",
    choices: [], serviceKeys: CONCEALED_SERVICE_KEYS,
  },
];

export async function seedRoutingV2Policies(db: PrismaClient = prisma) {
  // The version that carries Routing V2. Resolved, never assumed: attaching
  // these to the wrong version would leave them invisible to provisioning.
  const version = await db.templateVersion.findFirstOrThrow({
    where: { trade: "electrical" }, orderBy: { version: "desc" },
    select: { id: true, version: true, kind: true },
  });

  let definitions = 0, links = 0;
  for (const d of ROUTING_V2_POLICY_DEFINITIONS) {
    const def = await db.templatePolicyDefinition.upsert({
      where: { templateVersionId_key: { templateVersionId: version.id, key: d.key } },
      update: { type: d.type, unit: d.unit, prompt: d.prompt, choices: d.choices, boundaryCount: 0 },
      create: {
        templateVersionId: version.id, key: d.key, type: d.type, unit: d.unit,
        boundaryCount: 0, prompt: d.prompt, choices: d.choices,
      },
      select: { id: true },
    });
    definitions++;

    for (const key of d.serviceKeys) {
      const svc = await db.templateService.findFirst({
        where: { templateVersionId: version.id, key }, select: { id: true } });
      if (!svc) continue;
      await db.templateServicePolicy.upsert({
        where: { templateServiceId_templatePolicyDefinitionId: {
          templateServiceId: svc.id, templatePolicyDefinitionId: def.id } },
        update: {}, create: { templateServiceId: svc.id, templatePolicyDefinitionId: def.id },
      });
      links++;
    }
  }
  return { version: version.version, kind: version.kind, definitions, links };
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-policies.ts")) {
  seedRoutingV2Policies()
    .then(async (r) => {
      console.log(`\n  electrical v${r.version} ${r.kind}: ${r.definitions} policy definitions, ${r.links} service links.\n`);
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
