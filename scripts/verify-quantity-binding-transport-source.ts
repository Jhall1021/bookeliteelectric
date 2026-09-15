import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;

function check(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.error(`  FAIL ${label}${detail ? `\n       ${detail}` : ""}`);
  }
}

function source(path: string) {
  return readFileSync(path, "utf8");
}

console.log("\nQUANTITY BINDING TRANSPORT — SOURCE GUARD\n");

const serviceExtractor = source("scripts/extract-template-service.ts");
const catalogExtractor = source("scripts/extract-template-catalog.ts");
const provisioning = source("lib/templateProvisioning.ts");

const copiesBinding = /quantityAnswerKey\s*:\s*c\.quantityAnswerKey/;

check(
  "single-service extraction copies quantityAnswerKey",
  copiesBinding.test(serviceExtractor),
  "scripts/extract-template-service.ts must copy the live component binding into the template component",
);

check(
  "catalog extraction copies quantityAnswerKey",
  copiesBinding.test(catalogExtractor),
  "scripts/extract-template-catalog.ts must copy the live component binding into the template component",
);

check(
  "contractor provisioning copies quantityAnswerKey",
  copiesBinding.test(provisioning),
  "lib/templateProvisioning.ts must copy the template component binding back into the contractor component",
);

// The dangerous failure mode is silent degradation to the static quantity.
// Keeping all three transport legs explicit means a field-list refactor cannot
// accidentally turn SURFACE_ROUTE_FT × 31 into SURFACE_ROUTE_FT × 1.
check(
  "all three transport legs are present",
  [serviceExtractor, catalogExtractor, provisioning].every((text) => copiesBinding.test(text)),
);

if (fail > 0) {
  console.error(`\n${fail} failed, ${pass} passed\n`);
  process.exit(1);
}

console.log(`\n${pass} passed\n`);
