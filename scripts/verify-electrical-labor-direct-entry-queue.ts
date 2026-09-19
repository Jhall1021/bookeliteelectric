import assert from "node:assert/strict";
import { buildElectricalLaborCalibrationProgress, buildElectricalLaborDirectEntryQueue } from "../lib/electrical/laborDirectEntryQueue";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };

const none = buildElectricalLaborDirectEntryQueue([]);
ok(none.length === 0, "no offered services produce no direct-entry work queue");

const outlet = buildElectricalLaborDirectEntryQueue(["replace-standard-outlet"]);
ok(outlet.length === 1 && outlet[0].operationKey === "ELEC_REPLACE_STANDARD_RECEPTACLE", "one fixed replacement asks only for its actual atomic operation");
ok(outlet[0].affectedServiceSlugs.join() === "replace-standard-outlet", "queue row names only the offered service it can unlock");

const shared = buildElectricalLaborDirectEntryQueue([
  "new-120v-outlet", "bidet-smart-toilet-outlet", "garage-door-opener-outlet", "replace-standard-outlet",
]);
ok(shared[0].affectedServiceSlugs.length === 3, "shared route operations sort ahead of one-service operations by unlock impact");
ok(shared.every((row) => row.affectedServiceSlugs.every((slug) => [
  "new-120v-outlet", "bidet-smart-toilet-outlet", "garage-door-opener-outlet", "replace-standard-outlet",
].includes(slug))), "queue never cites an unoffered service");

const excluded = buildElectricalLaborDirectEntryQueue(["replace-standard-outlet"], ["ELEC_REPLACE_STANDARD_RECEPTACLE"]);
ok(excluded.length === 0, "an established or already-proposed operation is suppressed");

const tv = buildElectricalLaborDirectEntryQueue(["tv-install-existing-location"]);
ok(tv[0].publishedStartingMinutes === 60, "a supported atomic reference is exposed as a starting point in minutes");

const raceway = buildElectricalLaborDirectEntryQueue(["surface-mounted-outlet"]);
ok(raceway.some((row) => row.operationKey === "ELEC_SURFACE_RACEWAY" && row.publishedStartingMinutes === null), "disputed raceway evidence never becomes a numeric starting point");
ok(raceway.some((row) => row.unit === "ft") && raceway.some((row) => row.unit === "each"), "queue preserves per-foot and per-item units instead of blending them");

const offered = ["replace-standard-outlet", "replace-standard-switch", "new-120v-outlet"];
const initialProgress = buildElectricalLaborCalibrationProgress(offered);
ok(initialProgress.offeredServiceCount === 3 && initialProgress.modeledServiceCount === 3, "progress counts offered and modeled services separately");
ok(initialProgress.establishedOperationCount === 0 && initialProgress.operationCompleteServiceCount === 0, "fresh progress starts with no invented completion");
const firstBatchKeys = buildElectricalLaborDirectEntryQueue(offered).slice(0, 12).map((entry) => entry.operationKey);
const nextQueue = buildElectricalLaborDirectEntryQueue(offered, firstBatchKeys);
ok(nextQueue.every((entry) => !firstBatchKeys.includes(entry.operationKey)), "a saved batch disappears from the next queue immediately");
const afterBatch = buildElectricalLaborCalibrationProgress(offered, firstBatchKeys);
ok(afterBatch.establishedOperationCount === firstBatchKeys.length && afterBatch.remainingOperationCount === initialProgress.requiredOperationCount - firstBatchKeys.length, "partial-save progress advances by the exact distinct units saved");
const allRequired = buildElectricalLaborDirectEntryQueue(offered).map((entry) => entry.operationKey);
const complete = buildElectricalLaborCalibrationProgress(offered, allRequired);
ok(complete.remainingOperationCount === 0 && complete.operationCompleteServiceCount === 3, "all required units complete operation coverage for every modeled offered service");
const unknown = buildElectricalLaborCalibrationProgress(["not-in-the-ledger"]);
ok(unknown.modeledServiceCount === 0 && unknown.notModeledServiceSlugs.join() === "not-in-the-ledger", "unmodeled offered service is reported rather than counted as complete");

console.log(`ELECTRICAL LABOR DIRECT-ENTRY QUEUE — ${checks}/${checks} checks passed`);
