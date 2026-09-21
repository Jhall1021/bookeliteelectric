/** DB-free authoring + resolver regression. Run with node --import tsx. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { attachSurfaceRouteModule, SURFACE_KEYS, SURFACE_ENDPOINT_RECIPE, SURFACE_ROUTE_COMPONENTS } from "../prisma/_surfaceRouteModule";
import { ACCESSIBLE_KEYS, attachAccessibleConcealedModule, attachBackToBackModule } from "../prisma/_concealedRouteModules";
import { attachFinishedWallModule, FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { NUMERIC_UNKNOWN, selectNumericOption, validateNumericRanges } from "../lib/numericRouteRanges";
import { resolveBoundQuantity } from "../lib/routeResolver";
import { routeShapeFromAnswers } from "../lib/electrical/resolveWithDerivedPricing";
import { computeMaterialTakeoff } from "../lib/electrical/materialTakeoff";
import { optionForStoredGuidedFlowAnswer } from "../lib/guidedFlowStoredAnswer";
import { routingTreeFixture } from "./_routingTreeFixture";
let checks=0;
function check(value:unknown,label:string) { assert.ok(value,label); checks++; }
const clear = (feet:string) => ({[SURFACE_KEYS.feet]:feet,[SURFACE_KEYS.inside]:"0",[SURFACE_KEYS.outside]:"0",[SURFACE_KEYS.flat]:"0",[SURFACE_KEYS.surface]:"drywall",[SURFACE_KEYS.obstacles]:"clear"});
const components=(r:any):{key:string;quantity:number}[]=>r.config?.components ?? [];

/** Explore every option edge, with numeric representative answers supplied by
 * the authored interval; prove terminal paths and quantity binding reachability.
 */
function graph(f:ReturnType<typeof routingTreeFixture>) {
  const reachable=new Set<string>(); let paths=0;
  function walk(q:any,visited:Set<string>) {
    check(!visited.has(q.id),`no cycle at ${q.key}`); reachable.add(q.id);
    const path=new Set([...visited,q.id]);
    check(q.options.length>0,`${q.key} has an outcome`);
    if (q.inputType==="NUMBER") {
      check(validateNumericRanges(q).length===0,`${q.key}: complete valid numeric domain`);
      check(q.options.some((o:any)=>o.value===NUMERIC_UNKNOWN),`${q.key}: manual uncertainty exit`);
    }
    for (const o of q.options) {
      if(o.routeAction==="CONTINUE") {
        const next=f.questions.find(q=>q.id===o.nextQuestionId); check(next,`valid next: ${q.key}/${o.value}`); walk(next,path);
      } else {
        check(["RESOLVE_INSTANT","PHOTO_REVIEW"].includes(o.routeAction),`intentional terminal: ${q.key}/${o.value}`);paths++;
      }
      for(const c of o.components) if(c.quantityAnswerKey) {
        check(f.questions.some(q=>q.key===c.quantityAnswerKey&&path.has(q.id)),`binding ${c.canonicalComponentId} is on walked path`);
      }
    }
  }
  walk(f.loaded().questions[0],new Set());check(reachable.size===f.questions.length,"all authored questions reachable");return paths;
}
async function main() {
 check(routeShapeFromAnswers(clear("14.625")).routeFeet === 14.625, "derived takeoff route shape preserves fractional footage");
 const routes:string[]=[];
 for(const endpoint of ["OUTLET","SWITCH","FIXTURE_BOX"] as const) {
  const f=routingTreeFixture();await attachSurfaceRouteModule(f.db,"fixture",endpoint,1);
  const ids=f.questions.map(q=>[q.key,q.id]);await attachSurfaceRouteModule(f.db,"fixture",endpoint,1);
  check(JSON.stringify(ids)===JSON.stringify(f.questions.map(q=>[q.key,q.id])),`${endpoint}: reauthoring preserves question identities`);
  check(f.questions.length===6,`${endpoint}: shared six-question module`);graph(f);
  for(const feet of ["1","14.625","19.999","20.5","200"]) {
    const result=f.resolve(clear(feet));const cs=components(result);
    check(cs.find(c=>c.key==="SURFACE_ROUTE_FT")?.quantity===Number(feet),`${endpoint}: ${feet} remains exact through actual resolver`);
    check(!cs.some(c=>c.key.includes("CORNER")),`${endpoint}: explicit zero emits no fittings`);
    const recipe=SURFACE_ENDPOINT_RECIPE[endpoint];check(cs.some(c=>c.key===recipe.core)&&cs.some(c=>c.key===recipe.box),`${endpoint}: correct endpoint recipe`);
  }
  const counted=f.resolve({...clear("14.625"),[SURFACE_KEYS.flat]:"2",[SURFACE_KEYS.inside]:"1",[SURFACE_KEYS.outside]:"3"});
  const cs=components(counted);check(cs.find(c=>c.key==="SURFACE_ROUTE_FLAT_CORNER")?.quantity===2,`${endpoint}: physical flat turns retained`);
  check(cs.find(c=>c.key==="SURFACE_ROUTE_INSIDE_CORNER")?.quantity===1&&cs.find(c=>c.key==="SURFACE_ROUTE_OUTSIDE_CORNER")?.quantity===3,`${endpoint}: distinct physical inside/outside counts`);
  routes.push(JSON.stringify(cs.filter(c=>(SURFACE_ROUTE_COMPONENTS as readonly string[]).includes(c.key)).map(c=>[c.key,c.quantity])));
  for(const q of f.questions.filter(q=>q.inputType==="NUMBER")) {
    const result=f.resolve({...clear("14.625"),[q.key]:NUMERIC_UNKNOWN});
    check(result.status==="REVIEW"&&components(result).length===0,`${endpoint}/${q.key}: unknown cannot price`);
    check(result.status==="REVIEW"&&result.photoLabels.length===0,`${endpoint}/${q.key}: review requires no camera fact`);
  }
  for(const text of ["", "0", "-1", "Infinity", "NaN", "14-16", "14ft", "1e2", "20.000000000000000001", "201"]) {
    check(f.resolve(clear(text)).status==="INVALID",`${endpoint}: refuses invalid or unrepresentable footage ${text}`);
  }
  for(const key of [SURFACE_KEYS.flat,SURFACE_KEYS.inside,SURFACE_KEYS.outside]) {
    check(f.resolve({...clear("14.625"),[key]:"1.5"}).status==="INVALID",`${endpoint}: fractional fitting refused`);
    const q=f.questions.find(q=>q.key===key);check(selectNumericOption(q,"1.5").kind==="invalid",`${endpoint}: browser also refuses fractional count`);
  }
  const length=f.questions.find(q=>q.key===SURFACE_KEYS.feet);
  check(selectNumericOption(length,"14.625").kind==="option",`${endpoint}: manual selector accepts same fraction`);
  check(resolveBoundQuantity({quantity:1,quantityAnswerKey:length.key},clear("14.625"),[],"SURFACE_ROUTE_FT").kind==="broken","unvisited answer cannot bind");
 }
 check(routes.every(r=>r===routes[0]),"all three endpoints have identical route components and quantities");
 const a=routingTreeFixture();await attachAccessibleConcealedModule(a.db,"fixture","OUTLET",1);graph(a);
 const accessibleQuestion=a.questions.find(q=>q.key===ACCESSIBLE_KEYS.feet);
 check(accessibleQuestion?.prompt.includes("Roughly")===true&&accessibleQuestion.helpText?.includes("whole-number guess is enough")===true&&accessibleQuestion.helpText?.includes("do not need to measure")===true,"accessible route asks for an easy homeowner estimate, not false precision");
 const accessibleEstimate=a.resolve({accessible_route_feet:"14.625"});
 check(components(accessibleEstimate).find(c=>c.key==="CONCEALED_ROUTE_FT")?.quantity===14.625,"accessible planning footage stays fractional");
 check(accessibleEstimate.status==="REVIEW"&&accessibleEstimate.photoLabels.length===1,"homeowner accessible-path estimate requires contractor review and supporting context");
 check(a.resolve({accessible_route_feet:NUMERIC_UNKNOWN}).status==="REVIEW","hidden/unobserved accessible path can remain unknown");
 const b=routingTreeFixture();await attachBackToBackModule(b.db,"fixture","OUTLET",1);graph(b);
 check(!components(b.resolve({back_to_back_confirm:"yes"})).some(c=>c.key.endsWith("_FT")),"back-to-back invents no footage");
 check(b.resolve({back_to_back_confirm:"sameWall"}).status==="INVALID","sameWall does not establish back-to-back");
 const f=routingTreeFixture();await attachFinishedWallModule(f.db,"fixture","OUTLET",1);graph(f);
 const feet=f.questions.find(q=>q.key===FINISHED_KEYS.feet);
 for(const [text,value] of [["1","within"],["19.999","within"],["20","within"],["20.0001","beyond"],["20.5","beyond"],["300","beyond"]]) {
   const r=selectNumericOption(feet,text);check(r.kind==="option"&&r.option.value===value,`${text} follows authored decimal envelope`);
   const reversed=selectNumericOption({...feet,options:[...feet.options].reverse()},text);check(JSON.stringify(r)===JSON.stringify(reversed),"option order cannot change decimal routing");
 }
 check(f.resolve({[FINISHED_KEYS.backToBack]:"no",[FINISHED_KEYS.feet]:"20.5"}).status==="REVIEW","actual finished-wall resolver reviews 20.5");
 for(const text of ["14.625","20.5",NUMERIC_UNKNOWN]) {
   const option=optionForStoredGuidedFlowAnswer(feet,text);
   check(option?.value===text,"stored numeric replay preserves actual answer");
   check(option?.routeAction===(text==="14.625"?"CONTINUE":"PHOTO_REVIEW"),"stored replay uses same current route");
 }
 check(optionForStoredGuidedFlowAnswer(feet,"14-16")===null,"ambiguous stored range is asked again, never collapsed");
 check(optionForStoredGuidedFlowAnswer(feet,"301")===null,"out-of-domain stored answer is asked again");
 const malformedUnknown={...feet,options:feet.options.map((o:any)=>o.value===NUMERIC_UNKNOWN?{...o,photosBlockBooking:false}:o)};
 check(selectNumericOption(malformedUnknown,NUMERIC_UNKNOWN).kind==="broken","unknown cannot use nonblocking photo semantics to price");
 const gap={...feet,options:feet.options.map((o:any)=>o.value==="beyond"?{...o,numberAtLeast:21,numberAtLeastExclusive:false}:o)};
 check(validateNumericRanges(gap).some(p=>p.kind==="GAP"),"old 20/21 envelope is a decimal gap, not silently repaired");
 check(selectNumericOption(gap,"14.625").kind==="broken","malformed decimal tree fails closed even away from gap");
 const overlap={...feet,options:feet.options.map((o:any)=>({...o,numberAtLeastExclusive:false}))};
 check(validateNumericRanges(overlap).some(p=>p.kind==="OVERLAP"),"double-inclusive threshold refused");
 const legacy={key:"dimensions",numberMin:null,numberMax:null,options:[{value:"dimensions",numberAtLeast:null,numberAtMost:null}]};
 check(selectNumericOption(legacy,"8 x 8").kind==="option","unbounded legacy dimension entry preserved");
 const count={...legacy,numberMin:0,numberMax:20};
 check(selectNumericOption(count,"1.5").kind==="invalid","existing bounded numeric questions default to whole counts");
 // Real takeoff implementation: round purchased sticks, never measured feet.
 const takeoff=(turnCount:number)=>computeMaterialTakeoff({components:[{key:"SURFACE_ROUTE_FT",quantity:14.625}],
   recipes:[{componentKey:"SURFACE_ROUTE_FT",role:"CHANNEL",perUnit:1,unit:"ft"}],
   selections:[{role:"CHANNEL",packageQuantity:5,packageUnit:"ft",packagePriceCents:100}],
   divisibility:[{role:"CHANNEL",divisibility:"SEGMENTED_BY_TURNS"}],shape:{turnCount},requiredClasses:[],derivedRequirements:[],
   conductors:{known:false,code:"CONDUCTOR_SPECIFICATION_NOT_ESTABLISHED",reason:"This test proves only the channel subassembly"},segmentation:{notApplicable:true,because:"Channel-only measurement regression"}});
 const straight=takeoff(0),turned=takeoff(1);
 check(straight.physicalRequirements[0]?.quantity===14.625,"takeoff preserves fractional physical footage");
 check(straight.purchaseRequirements[0]?.packages===3,"purchase rounding occurs only at five-foot stock boundary");
 check(turned.unresolvedRequirements.some(u=>u.code==="SEGMENT_GEOMETRY_REQUIRED"),"turn totals without segment geometry still refuse exact stock quantity");
 for(const [path,fields] of [["app/api/services/[slug]/route.ts",["numberAllowsDecimal: q.numberAllowsDecimal","numberAtLeastExclusive: o.numberAtLeastExclusive"]],
   ["scripts/extract-template-service.ts",["numberAllowsDecimal: q.numberAllowsDecimal","numberAtLeastExclusive: o.numberAtLeastExclusive"]],
   ["lib/templateProvisioning.ts",["numberAllowsDecimal: qq.numberAllowsDecimal","numberAtLeastExclusive: o.numberAtLeastExclusive"]]] as const) {
   const source=readFileSync(path,"utf8");for(const field of fields)check(source.includes(field),`${path} carries ${field}`);
 }
 console.log(`${checks} canonical routing contract assertions passed`);
}
main().catch(e=>{console.error(e);process.exitCode=1});
