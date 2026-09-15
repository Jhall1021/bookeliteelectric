/** Disposable database ONLY. Proves real template storage -> production
 * installCatalog -> live rows -> resolver preserves precision and open edges.
 * The fixture serializer is not an execution of either extraction CLI.
 */
import assert from "node:assert/strict";
import { installCatalog, templateVersionSource } from "../lib/templateProvisioning";
import { attachSurfaceRouteModule, SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import { attachFinishedWallModule, FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { routingTreeFixture } from "./_routingTreeFixture";
import { loadServiceForResolution, resolveRoute } from "../lib/routeResolver";
import { seedRoutingV2MaterialRoles } from "../prisma/seed-routing-v2-material-roles";
import { seedSurfaceComponentMaterials } from "../prisma/seed-routing-v2-component-materials";
import { seedRoutingV2Policies } from "../prisma/seed-routing-v2-policies";
import { buildPricedDerivedContractor, asTenant, changeChannelCost, reapprove } from "./_derivedStorefrontFixture";
import { evaluateStorefrontPrice } from "../lib/storefrontPriceEvaluation";
import { loadSurfaceTakeoff } from "../lib/electrical/loadSurfaceTakeoff";
import { routeShapeFromAnswers } from "../lib/electrical/resolveWithDerivedPricing";
import { prisma as singleton } from "../lib/prisma";
import type { PricingSettings } from "../lib/pricing";

async function main() {
  const url=new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1","localhost","[::1]"].includes(url.hostname),"loopback database required");
  const db=singleton;
  let checks=0;const check=(c:unknown,label:string)=>{assert.ok(c,label);checks++;};
  try {
    const identity=await db.databaseIdentity.findUnique({where:{id:"singleton"}});
    assert.ok(identity?.key.startsWith("local-") && identity.neonEndpoint.startsWith("local-"),"disposable local identity required before mutation");
    assert.equal(await db.contractor.count(),0,"fixture requires an empty disposable database");
    assert.equal(await db.templateVersion.count(),0,"fixture requires no existing catalog");
    await db.serviceCategory.create({data:{slug:"routing-proof",name:"Routing proof"}});
    const category=await db.canonicalCategory.create({data:{slug:"routing-proof",name:"Routing proof"}});
    const version=await db.templateVersion.create({data:{trade:"electrical",version:1,kind:"SNAPSHOT"}});
    const contractor=await db.contractor.create({data:{slug:"rv2-pilot-rehearsal-precision",name:"Disposable precision proof",pricingStrategy:"FLAT_RATE"}});
    const componentIds=new Map<string,string>();
    for(const endpoint of ["OUTLET","SWITCH","FIXTURE_BOX","FINISHED"] as const) {
      const f=routingTreeFixture();
      if(endpoint==="FINISHED")await attachFinishedWallModule(f.db,"fixture","OUTLET",1);
      else await attachSurfaceRouteModule(f.db,"fixture",endpoint,1);
      const template=await db.templateService.create({data:{templateVersionId:version.id,key:endpoint==="OUTLET"?"new-120v-outlet":endpoint,slug:endpoint==="OUTLET"?"new-120v-outlet":endpoint.toLowerCase(),name:endpoint,
        canonicalCategoryId:category.id,bookingType:"INSTANT",photoState:"NONE",pricingMethod:"DERIVED_RESOLVED_SCOPE"}});
      for(const q of f.questions) {
        const tq=await db.templateQuestion.create({data:{templateServiceId:template.id,key:q.key,prompt:q.prompt,helpText:q.helpText,
          inputType:q.inputType,order:q.order,numberMin:q.numberMin,numberMax:q.numberMax,numberAllowsDecimal:q.numberAllowsDecimal}});
        for(const o of q.options) {
          const to=await db.templateAnswerOption.create({data:{templateQuestionId:tq.id,value:o.value,label:o.label,routeAction:o.routeAction,order:o.order,
            nextQuestionKey:f.questions.find(n=>n.id===o.nextQuestionId)?.key ?? null,
            numberAtLeast:o.numberAtLeast,numberAtMost:o.numberAtMost,numberAtLeastExclusive:o.numberAtLeastExclusive,
            requiresCapabilityKey:o.requiresCapabilityKey,photosBlockBooking:o.photosBlockBooking,requiredPhotoLabels:o.requiredPhotoLabels,illustrationUrls:[]}});
          for(const c of o.components) {
            if(!componentIds.has(c.canonicalComponentId)) {
              const row=await db.canonicalComponent.create({data:{key:c.canonicalComponentId,name:c.canonicalComponentId,customerFacingLabel:c.canonicalComponentId}});
              componentIds.set(c.canonicalComponentId,row.id);
            }
            await db.templateAnswerOptionComponent.create({data:{templateAnswerOptionId:to.id,canonicalComponentId:componentIds.get(c.canonicalComponentId)!,
              quantity:c.quantity,quantityAnswerKey:c.quantityAnswerKey}});
          }
        }
      }
    }
    const catalog=await templateVersionSource(db,"electrical").load();
    await installCatalog(db,contractor.id,catalog);
    for(const endpoint of ["new-120v-outlet","switch","fixture_box","finished"]) {
      const service=await db.service.findFirstOrThrow({where:{contractorId:contractor.id,slug:endpoint},include:{questions:{include:{options:true}}}});
      check(service.basePrice===null,"provisioning invents no published price");
      const feet=service.questions.find(q=>q.key===(endpoint==="finished"?FINISHED_KEYS.feet:SURFACE_KEYS.feet))!;
      check(feet.numberAllowsDecimal,"decimal metadata survives real provisioning");
      const loaded=(await loadServiceForResolution(db,service.id))!;
      if(endpoint==="finished") {
        check(feet.options.find(o=>o.value==="beyond")?.numberAtLeast===20,"threshold remains 20");
        check(feet.options.find(o=>o.value==="beyond")?.numberAtLeastExclusive,"open edge survives real provisioning");
        check(resolveRoute(loaded,{[FINISHED_KEYS.backToBack]:"no",[FINISHED_KEYS.feet]:"20.5"},true,{} as PricingSettings).status==="REVIEW","persisted 20.5 follows review branch");
      } else {
        check(service.questions.filter(q=>q.inputType==="NUMBER"&&q.key!==SURFACE_KEYS.feet).every(q=>!q.numberAllowsDecimal),"physical fitting counts remain integers");
        const result=resolveRoute(loaded,{[SURFACE_KEYS.feet]:"14.625",[SURFACE_KEYS.flat]:"0",[SURFACE_KEYS.inside]:"0",[SURFACE_KEYS.outside]:"0",[SURFACE_KEYS.surface]:"drywall",[SURFACE_KEYS.obstacles]:"clear"},true,{} as PricingSettings);
        check("config" in result && result.config.components.some(c=>c.key==="SURFACE_ROUTE_FT"&&c.quantity===14.625),"persisted binding resolves exact fractional footage");
      }
    }
    await seedRoutingV2MaterialRoles(db);
    await seedSurfaceComponentMaterials(db);
    await seedRoutingV2Policies(db);
    const priced=await buildPricedDerivedContractor(db,"rv2-pilot-rehearsal-fractional-economics");
    const answers={ [SURFACE_KEYS.feet]:"14.625",[SURFACE_KEYS.flat]:"0",[SURFACE_KEYS.inside]:"0",[SURFACE_KEYS.outside]:"0",[SURFACE_KEYS.surface]:"drywall",[SURFACE_KEYS.obstacles]:"clear" };
    const evaluate=(facts=answers)=>asTenant(priced.contractorId,guarded=>evaluateStorefrontPrice(guarded,{contractorId:priced.contractorId,sessionId:null,serviceId:priced.serviceId,answers:facts}));
    const initial=await evaluate();
    check(initial.ok&&initial.evaluation.outcome==="PRICED","approved fractional route reaches authoritative storefront PRICED");
    const loaded=(await loadServiceForResolution(db,priced.serviceId))!;
    const physical=resolveRoute(loaded,answers,true,{} as PricingSettings);
    assert.ok("config" in physical);
    const takeoff=await loadSurfaceTakeoff(db,priced.contractorId,{components:physical.config.components,...routeShapeFromAnswers(answers)});
    check(takeoff.physicalRequirements.some(r=>r.role==="SURFACE_RACEWAY_CHANNEL"&&r.quantity===14.625),"real database takeoff retains 14.625 feet");
    check(takeoff.unresolvedRequirements.length===0,"complete configured straight-route takeoff");
    const turned=await evaluate({...answers,[SURFACE_KEYS.flat]:"1"});
    check(turned.ok&&turned.evaluation.outcome==="REVIEW","physical turn without segment geometry stays REVIEW");
    await changeChannelCost(priced.contractorId,3457);
    const stale=await evaluate();
    check(stale.ok&&stale.evaluation.outcome==="REVIEW","changed economics invalidate prior approval");
    await reapprove(db,priced.contractorId,priced.serviceId);
    const restored=await evaluate();
    check(restored.ok&&restored.evaluation.outcome==="PRICED","reapproval restores fixed pricing");
    if(initial.ok&&initial.evaluation.outcome==="PRICED"&&restored.ok&&restored.evaluation.outcome==="PRICED")
      check(restored.evaluation.priceCents>initial.evaluation.priceCents,"new price uses changed economics");
    check(await db.visit.count()===0 && await db.lineItem.count()===0 && await db.booking.count()===0,"evaluation created no visit, line or booking");
    console.log(`${checks} database provisioning and pricing assertions passed`);
  } finally {await db.$disconnect();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
