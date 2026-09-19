import { strict as assert } from "node:assert";
import { ELECTRICAL_LABOR_SCOPE_FACTS, ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY } from "../lib/electrical/laborScopeFactRegistry";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const rows = buildElectricalServiceLaborReadiness();
const requiredFacts = new Set(rows.flatMap((row) => row.missingScopeFacts));

ok(new Set(ELECTRICAL_LABOR_SCOPE_FACTS.map((fact) => fact.key)).size === ELECTRICAL_LABOR_SCOPE_FACTS.length, "scope fact keys are unique");
ok([...requiredFacts].every((key) => ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.has(key)), "every missing fact across all 82 services has an explicit collection design");
ok(ELECTRICAL_LABOR_SCOPE_FACTS.every((fact) => requiredFacts.has(fact.key)), "the registry contains no speculative facts unused by the current service catalog");
ok(ELECTRICAL_LABOR_SCOPE_FACTS.every((fact) => fact.collectionPaths.length > 0), "every scope fact has at least one collection path");
ok(ELECTRICAL_LABOR_SCOPE_FACTS.filter((fact) => fact.collectionPaths.includes("SYSTEM_DERIVED")).every((fact) => Boolean(fact.derivation)), "every derived value declares its derivation authority");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("accessibleRouteFeet")?.collectionPaths.join() === "ROUTE_ASSIST_ACCESSIBLE_PATH_CONFIRMED,CONTRACTOR_MEASUREMENT", "hidden accessible-space footage allows explicit Route Assist path capture or contractor measurement, never ordinary room-scan inference");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("framingSpacingInches")?.collectionPaths.includes("CONTRACTOR_POLICY"), "framing spacing comes from contractor policy or measurement, not homeowner guessing");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("fanSupportRequired")?.collectionPaths.join() === "GUIDED_PHOTO_REVIEW", "fan support is review-determined rather than homeowner-diagnosed");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("powerRemediationRequired")?.collectionPaths.join() === "GUIDED_PHOTO_REVIEW", "power remediation is review-determined rather than homeowner-diagnosed");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("straightJointCount")?.collectionPaths.join() === "SYSTEM_DERIVED", "raceway joints are derived from measured geometry and product length rather than separately asked");
ok(ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get("housingAdaptationRequired")?.description.includes("finish repair remains excluded"), "bath-fan adaptation preserves the locked finish-repair exclusion");

console.log(`\nELECTRICAL LABOR SCOPE FACT REGISTRY — ${checks}/${checks} checks passed`);
