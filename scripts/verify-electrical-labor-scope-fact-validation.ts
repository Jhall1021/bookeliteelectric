import { strict as assert } from "node:assert";
import { validateElectricalLaborScopeFacts } from "../lib/electrical/validateLaborScopeFacts";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };

const accessibleCustomer = validateElectricalLaborScopeFacts(["accessibleRouteFeet"], {
  accessibleRouteFeet: { value: 30, source: "CUSTOMER_TREE" },
});
ok(accessibleCustomer.kind === "INCOMPLETE" && accessibleCustomer.invalidFacts.some((message) => message.includes("not an authorized source")), "homeowner-entered hidden accessible footage fails closed");

const accessibleMeasured = validateElectricalLaborScopeFacts(["accessibleRouteFeet"], {
  accessibleRouteFeet: { value: 30, source: "CONTRACTOR_MEASUREMENT" },
});
ok(accessibleMeasured.kind === "READY" && accessibleMeasured.facts.accessibleRouteFeet === 30, "contractor-measured accessible footage is accepted");

const accessibleRouteAssist = validateElectricalLaborScopeFacts(["accessibleRouteFeet"], {
  accessibleRouteFeet: { value: 32.5, source: "ROUTE_ASSIST_ACCESSIBLE_PATH_CONFIRMED" },
});
ok(accessibleRouteAssist.kind === "READY" && accessibleRouteAssist.facts.accessibleRouteFeet === 32.5, "explicit Route Assist accessible-path capture is accepted");

const ordinaryRoomScan = validateElectricalLaborScopeFacts(["accessibleRouteFeet"], {
  accessibleRouteFeet: { value: 32.5, source: "ROUTE_ASSIST_CONFIRMED" },
});
ok(ordinaryRoomScan.kind === "INCOMPLETE", "ordinary Route Assist room geometry still cannot masquerade as a hidden accessible path");

const finishedMeasured = validateElectricalLaborScopeFacts(["concealedRouteFeet", "perpendicularFramingFeet", "framingSpacingInches"], {
  concealedRouteFeet: { value: 18.5, source: "ROUTE_ASSIST_CONFIRMED" },
  perpendicularFramingFeet: { value: 10, source: "ROUTE_ASSIST_CONFIRMED" },
  framingSpacingInches: { value: 16, source: "CONTRACTOR_POLICY" },
});
ok(finishedMeasured.kind === "READY", "confirmed finished-route geometry plus contractor framing policy is accepted");

const guessedFraming = validateElectricalLaborScopeFacts(["framingSpacingInches"], {
  framingSpacingInches: { value: 16, source: "CUSTOMER_TREE" },
});
ok(guessedFraming.kind === "INCOMPLETE", "a plausible framing value still fails when supplied by an unauthorized source");

const fanDiagnosis = validateElectricalLaborScopeFacts(["fanSupportRequired"], {
  fanSupportRequired: { value: false, source: "CUSTOMER_TREE" },
});
ok(fanDiagnosis.kind === "INCOMPLETE", "homeowner fan-support diagnosis is rejected even when boolean-shaped");

const fanReview = validateElectricalLaborScopeFacts(["fanSupportRequired"], {
  fanSupportRequired: { value: false, source: "GUIDED_PHOTO_REVIEW" },
});
ok(fanReview.kind === "READY", "review-determined fan support is accepted");

const racewayTakeoff = validateElectricalLaborScopeFacts(["straightJointCount", "supportCount"], {
  straightJointCount: { value: 3, source: "SYSTEM_DERIVED" },
  supportCount: { value: 8, source: "SYSTEM_DERIVED" },
});
ok(racewayTakeoff.kind === "READY", "derived raceway takeoff counts are accepted from the system authority");

const handEnteredTakeoff = validateElectricalLaborScopeFacts(["straightJointCount"], {
  straightJointCount: { value: 3, source: "CUSTOMER_TREE" },
});
ok(handEnteredTakeoff.kind === "INCOMPLETE", "derived takeoffs cannot be replaced by customer-entered counts");

const badCount = validateElectricalLaborScopeFacts(["lightCount"], {
  lightCount: { value: 2.5, source: "CUSTOMER_TREE" },
});
ok(badCount.kind === "INCOMPLETE" && badCount.invalidFacts.some((message) => message.includes("invalid count")), "fractional fixture counts are rejected");

const missing = validateElectricalLaborScopeFacts(["lightCount", "interLightCableFeet"], {
  lightCount: { value: 4, source: "CUSTOMER_TREE" },
});
ok(missing.kind === "INCOMPLETE" && missing.missingFacts.join() === "interLightCableFeet", "missing required facts remain explicit");

const unknown = validateElectricalLaborScopeFacts(["inventedFact"], {});
ok(unknown.kind === "INCOMPLETE" && unknown.invalidFacts[0].includes("no registered collection authority"), "unregistered facts fail closed");

console.log(`\nELECTRICAL LABOR SCOPE FACT VALIDATION — ${checks}/${checks} checks passed`);
