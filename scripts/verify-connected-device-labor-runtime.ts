import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { connectedDeviceFactsForService, connectedDeviceFactsFromChoice, CONNECTED_DEVICE_POLICY_KEYS } from "../lib/electrical/connectedDeviceLaborFacts";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";
import { ROUTING_V2_POLICY_DEFINITIONS } from "../prisma/seed-routing-v2-policies";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const decisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.5, source: "DIRECT" as const }));

ok(connectedDeviceFactsFromChoice(null) === null, "missing commissioning policy fails closed");
ok(connectedDeviceFactsFromChoice("UNKNOWN") === null, "an unregistered commissioning choice fails closed");
ok(Object.keys(connectedDeviceFactsForService("replace-standard-outlet", { commissioningIncluded: true })).length === 0, "connected-device policy facts do not leak into unrelated service projections");
const included = connectedDeviceFactsFromChoice("INCLUDED")!;
const excluded = connectedDeviceFactsFromChoice("NOT_INCLUDED")!;
const smartSwitchIncluded = projectElectricalServiceLabor("customer-supplied-smart-switch", decisions, included);
const smartSwitchExcluded = projectElectricalServiceLabor("customer-supplied-smart-switch", decisions, excluded);
ok(smartSwitchIncluded.kind === "READY_FOR_APPROVAL" && smartSwitchIncluded.suggestedHours === 1, "smart-switch hardware plus commissioning produces a reviewable atomic duration");
ok(smartSwitchExcluded.kind === "READY_FOR_APPROVAL" && smartSwitchExcluded.suggestedHours === 1, "smart-switch programming remains included even when the optional connected-device policy excludes commissioning elsewhere");
ok(projectElectricalServiceLabor("customer-supplied-smart-switch", decisions).kind === "READY_FOR_APPROVAL", "smart-switch labor does not depend on an optional commissioning policy");
ok(smartSwitchIncluded.kind === "READY_FOR_APPROVAL" && smartSwitchIncluded.projection.lines.some((line) => line.operationKey === "ELEC_INSTALL_SMART_SWITCH_HARDWARE"), "smart-switch uses its switch-specific hardware operation");
const smartOutletIncluded = projectElectricalServiceLabor("smart-outlet-upgrade", decisions, included);
ok(smartOutletIncluded.kind === "READY_FOR_APPROVAL" && smartOutletIncluded.projection.lines.some((line) => line.operationKey === "ELEC_INSTALL_SMART_RECEPTACLE_HARDWARE"), "smart receptacle uses its receptacle-specific hardware operation");
ok(projectElectricalServiceLabor("smart-outlet-upgrade", decisions).kind === "NO_STANDARD_SCOPE", "smart outlet refuses a duration while commissioning policy is missing");
ok(projectElectricalServiceLabor("smart-outlet-upgrade", decisions, included).kind === "READY_FOR_APPROVAL", "resolved commissioning policy connects smart-outlet labor review");
ok(projectElectricalServiceLabor("video-doorbell-existing-wiring", decisions, included).kind === "READY_FOR_APPROVAL", "working existing-wiring doorbell connects through the commissioning policy");
ok(projectElectricalServiceLabor("floodlight-camera-existing", decisions, excluded).kind === "READY_FOR_APPROVAL", "working existing-fixture camera connects without inventing commissioning labor");
const thermostat = projectElectricalServiceLabor("smart-thermostat-install", decisions, included);
ok(thermostat.kind === "READY_FOR_APPROVAL" && thermostat.projection.lines.every((line) => line.operationKey !== "ELEC_THERMOSTAT_POWER_REMEDIATION"), "compatible-wiring thermostat connects without inventing remediation labor");
ok(projectElectricalServiceLabor("smart-thermostat-install", decisions).kind === "NO_STANDARD_SCOPE", "thermostat duration still fails closed while commissioning policy is missing");
const tree = readFileSync("prisma/seed-questions.ts", "utf8");
const thermostatTree = tree.slice(tree.indexOf("const thermostat"), tree.indexOf("// The two remote-quote-only jobs"));
ok(["yes", "no", "unsure"].every((value) => {
  const branch = thermostatTree.slice(thermostatTree.indexOf(`value: "${value}"`));
  const end = branch.indexOf("},", branch.indexOf("routeAction"));
  const option = end >= 0 ? branch.slice(0, end) : branch;
  return option.includes('routeAction: "PHOTO_REVIEW"') && option.includes("photosBlockBooking: true") && option.includes("cover removed");
}), "every homeowner C-wire answer requires blocking wiring photo review");
const definition = ROUTING_V2_POLICY_DEFINITIONS.find((row) => row.key === CONNECTED_DEVICE_POLICY_KEYS.commissioning);
ok(definition?.choices.join() === "INCLUDED,NOT_INCLUDED" && !definition.serviceKeys.includes("customer-supplied-smart-switch") && definition.serviceKeys.includes("smart-thermostat-install") && definition.serviceKeys.includes("video-doorbell-existing-wiring") && definition.serviceKeys.includes("floodlight-camera-existing"), "fresh catalogs apply the optional commissioning policy only where programming is not already fixed in scope");

console.log(`\nCONNECTED DEVICE LABOR RUNTIME — ${checks}/${checks} checks passed`);
