import assert from "node:assert/strict";
import { buildElectricalLaborDirectEntryQueue } from "../lib/electrical/laborDirectEntryQueue";

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

console.log(`ELECTRICAL LABOR DIRECT-ENTRY QUEUE — ${checks}/${checks} checks passed`);
