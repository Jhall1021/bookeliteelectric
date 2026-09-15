/** In-memory persistence for exercising the actual canonical module authors.
 * No database, credentials, duplicated question definitions or pricing rules.
 */
import type { PrismaClient } from "@prisma/client";
import { resolveRoute } from "../lib/routeResolver";
import { type PricingSettings } from "../lib/pricing";

export function routingTreeFixture() {
  const questions: any[] = [];
  let seq = 0;
  const option = (data: any) => {
    const q = questions.find(q => q.id === data.questionId);
    if (!q) throw new Error(`Unknown question ${data.questionId}`);
    const o = {
      id: `o${++seq}`, numberAtLeast: null, numberAtMost: null, numberAtLeastExclusive: false,
      priceModifierCents: 0, approvedComponentPriceCents: null, components: [],
      requiredPhotoLabels: [], photoGroups: [], conditionalDisclaimers: [],
      photosBlockBooking: false, nextQuestionId: null, requiresCapabilityKey: null,
      ...data,
    };
    q.options.push(o); return o;
  };
  const allOptions = () => questions.flatMap(q => q.options);
  const matches = (row: any, where: any) => Object.entries(where).every(([key,value]) => row[key] === value);
  const db = {
    question: {
      findFirst: async ({where}: any) => questions.find(q=>matches(q,where)) ?? null,
      create: async ({data}: any) => {
        const q = {id:`q${++seq}`, numberMin:null, numberMax:null, numberAllowsDecimal:false, options:[], ...data};
        questions.push(q); return q;
      },
      update: async ({where,data}: any) => Object.assign(questions.find(q=>matches(q,where)),data),
    },
    answerOption: {
      create: async ({data}: any) => option(data),
      createMany: async ({data}: any) => { data.forEach(option); return {count:data.length}; },
      deleteMany: async ({where}: any) => { for (const q of questions) q.options=q.options.filter((o:any)=>!matches(o,where)); },
      findFirstOrThrow: async ({where}: any) => {
        const o=allOptions().find(o=>matches(o,where)); if (!o) throw new Error("missing option"); return o;
      },
    },
    canonicalComponent: {findUnique: async ({where}: any) => ({id:where.key})},
    answerOptionComponent: {createMany: async ({data}: any) => {
      for (const c of data) {
        const o=allOptions().find(o=>o.id===c.answerOptionId);
        o.components.push({id:`c${++seq}`, quantityAnswerKey:null, ...c,
          canonicalComponent:{id:c.canonicalComponentId,key:c.canonicalComponentId,customerFacingLabel:c.canonicalComponentId,materials:[]}});
      }
      return {count:data.length};
    }},
  } as unknown as PrismaClient;
  const loaded = () => ({
    id:"fixture",slug:"routing-tree-fixture",contractorId:"fixture",questions:[...questions].sort((a,b)=>a.order-b.order),
    pricingMethod:"DERIVED_RESOLVED_SCOPE",basePrice:null,whileWeThereBasePrice:null,
    materialCostResolved:true,estimatedMinutes:0,requiresTechCount:1,fieldLaborHours:0,materialCostCents:0,
    ownComponents:new Map(),ownMaterialCosts:new Map(),
    capabilities:{DRYWALL_ACCESS_RESTORATION:"declared",BASEBOARD_ACCESS_REINSTALL:"declared"},
  } as unknown as Parameters<typeof resolveRoute>[0]);
  return {db,questions,loaded,resolve:(answers:Record<string,string>)=>resolveRoute(loaded(),answers,true,{} as PricingSettings)};
}
