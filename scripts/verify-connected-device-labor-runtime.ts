import { strict as assert } from "node:assert";
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
ok(smartSwitchExcluded.kind === "READY_FOR_APPROVAL" && smartSwitchExcluded.suggestedHours === 0.5, "smart-switch hardware without commissioning excludes that atomic operation");
ok(projectElectricalServiceLabor("smart-outlet-upgrade", decisions).kind === "NO_STANDARD_SCOPE", "smart outlet refuses a duration while commissioning policy is missing");
ok(projectElectricalServiceLabor("smart-outlet-upgrade", decisions, included).kind === "READY_FOR_APPROVAL", "resolved commissioning policy connects smart-outlet labor review");
ok(projectElectricalServiceLabor("smart-thermostat-install", decisions, included).kind === "NO_STANDARD_SCOPE", "thermostat remains blocked on guided power-remediation review");
const definition = ROUTING_V2_POLICY_DEFINITIONS.find((row) => row.key === CONNECTED_DEVICE_POLICY_KEYS.commissioning);
ok(definition?.choices.join() === "INCLUDED,NOT_INCLUDED" && definition.serviceKeys.includes("smart-thermostat-install"), "fresh catalogs receive one bounded commissioning policy for the connected-device family");

console.log(`\nCONNECTED DEVICE LABOR RUNTIME — ${checks}/${checks} checks passed`);
