import assert from "node:assert/strict";
import fs from "node:fs";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "../lib/electrical/atomicLabor";
import { projectElectricalServiceLabor } from "../lib/electrical/laborServiceApproval";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const allDecisions = ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => ({ operationKey: operation.key, hoursPerUnit: 0.25, source: "DIRECT" as const }));

const outlet = projectElectricalServiceLabor("replace-standard-outlet", allDecisions);
ok(outlet.kind === "READY_FOR_APPROVAL", "bounded replacement is ready with approved atomic labor");
ok(outlet.kind === "READY_FOR_APPROVAL" && outlet.suggestedHours === 0.25, "replacement duration is recomputed from its operation");
ok(outlet.canPublish === false, "ready service suggestion cannot publish");
const routed = projectElectricalServiceLabor("new-120v-outlet", allDecisions);
ok(routed.kind === "NO_STANDARD_SCOPE", "route-dependent service cannot use an invented standard");
ok(routed.kind === "NO_STANDARD_SCOPE" && routed.missingFacts.includes("accessibleRouteFeet"), "route-dependent refusal names its missing footage");
const undercabinetMissing = projectElectricalServiceLabor("under-cabinet-led-lighting", []);
ok(undercabinetMissing.kind === "BLOCKED", "bounded package remains blocked without approved operation labor");
const undercabinet = projectElectricalServiceLabor("under-cabinet-led-lighting", allDecisions);
ok(undercabinet.kind === "READY_FOR_APPROVAL", "bounded package becomes reviewable when every operation is approved");
ok(undercabinet.kind === "READY_FOR_APPROVAL" && undercabinet.projection.lines.some((line) => line.operationKey === "ELEC_UNDERCABINET_CHANNEL_AND_TAPE" && line.quantity === 12), "service review retains the package's 12-foot quantity");
const soundbar = projectElectricalServiceLabor("soundbar-installation", allDecisions);
ok(soundbar.kind === "READY_FOR_APPROVAL", "prepared soundbar package becomes reviewable without inventing concealed cable footage");
ok(soundbar.kind === "READY_FOR_APPROVAL" && soundbar.projection.lines.length === 1 && soundbar.projection.lines[0].operationKey === "ELEC_MOUNT_SOUNDBAR", "prepared soundbar duration excludes concealed routing labor");
const diagnostic = projectElectricalServiceLabor("electrical-troubleshooting", allDecisions);
ok(diagnostic.kind === "NOT_MODELED", "diagnostic work remains outside fixed service labor approval");

const route = fs.readFileSync("app/api/portal/labor-service-review/route.ts", "utf8");
const page = fs.readFileSync("app/dashboard/setup/page.tsx", "utf8");
const panel = fs.readFileSync("app/dashboard/setup/ServiceLaborReviewPanel.tsx", "utf8");
ok(route.includes('"contractorId" = ${ctx.contractorId}') && route.includes("FOR UPDATE"), "write boundary locks only the tenant-owned service");
ok(route.includes("projectElectricalServiceLabor") && route.includes("STALE_PROJECTION"), "write boundary recomputes and refuses stale review");
ok(route.includes("saveServicePricingInputs") && route.includes("fieldLaborHours"), "approval uses the shared partial pricing-input authority");
ok(route.includes("published: false") && !route.includes("publishedPriceApprovedAt"), "service labor approval cannot publish customer pricing");
ok(page.includes("projectElectricalServiceLabor") && page.includes("ServiceLaborReviewPanel"), "setup projects current offered services into the review panel");
ok(panel.includes("Approve selected durations") && panel.includes("operationName"), "contractor sees an itemized approval rather than an opaque total");
ok(panel.includes("does not approve or publish its customer price"), "service review states the separate price-approval boundary");
ok(panel.includes("Math.abs(row.currentHours - row.suggestedHours) <= 1e-9"), "a persisted duration equal to the current projection resumes as current rather than asking for duplicate approval");
ok(panel.includes("approvedHours.get(row.serviceId) === row.suggestedHours"), "local success applies only to the exact projection that was approved");
ok(panel.includes("router.refresh()"), "successful service-labor approval refreshes derived pricing without publishing it");
ok(panel.includes("labor durations current") && panel.includes("ready for review"), "service panel separates completed durations from pending review");
ok(panel.includes("priced from each job&apos;s route") && panel.includes("do not need one made-up service duration"), "route-dependent services are explained as dynamically priced rather than unfinished setup");

console.log(`ELECTRICAL LABOR SERVICE APPROVAL — ${checks}/${checks} checks passed`);
