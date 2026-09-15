import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nTEMPLATE CATALOG / ROUTING V2 EXTRACTION PARITY\n");

const catalog = readFileSync("scripts/extract-template-catalog.ts", "utf8");
const single = readFileSync("scripts/extract-template-service.ts", "utf8");

// The single-service extractor is the current Routing V2 reference until these
// two writers are deliberately consolidated. This verifier is source-level on
// purpose: extraction itself is a write operation and must not be run just to
// discover that a field was dropped.
check(
  "reference extractor carries NUMBER question bounds",
  single.includes("numberMin: q.numberMin") && single.includes("numberMax: q.numberMax"),
);
check(
  "full catalog carries NUMBER question bounds",
  catalog.includes("numberMin: q.numberMin") && catalog.includes("numberMax: q.numberMax"),
  "extract-template-catalog.ts must preserve TemplateQuestion.numberMin/numberMax before catalog extraction is safe",
);

check(
  "reference extractor carries numeric route predicates",
  single.includes("numberAtLeast: o.numberAtLeast") && single.includes("numberAtMost: o.numberAtMost"),
);
check(
  "full catalog carries numeric route predicates",
  catalog.includes("numberAtLeast: o.numberAtLeast") && catalog.includes("numberAtMost: o.numberAtMost"),
  "extract-template-catalog.ts must preserve numberAtLeast/numberAtMost before catalog extraction is safe",
);

check(
  "reference extractor carries capability requirements",
  single.includes("requiresCapabilityKey: o.requiresCapabilityKey"),
);
check(
  "full catalog carries capability requirements",
  catalog.includes("requiresCapabilityKey: o.requiresCapabilityKey"),
  "extract-template-catalog.ts must preserve requiresCapabilityKey before catalog extraction is safe",
);

check(
  "both extractors carry quantityAnswerKey",
  single.includes("quantityAnswerKey: c.quantityAnswerKey") &&
    catalog.includes("quantityAnswerKey: c.quantityAnswerKey"),
  "Routing V2 measured quantities must survive extraction",
);

check(
  "reference extractor drops retired option-less questions",
  single.includes("const liveQuestions = svc.questions.filter((q) => q.options.length > 0)") &&
    single.includes("liveQuestions.map"),
);
check(
  "full catalog drops retired option-less questions",
  catalog.includes("const liveQuestions = svc.questions.filter((q) => q.options.length > 0)") &&
    catalog.includes("liveQuestions.map"),
  "retired Routing V1 question rows must not become dead questions in a fresh template",
);

check(
  "reference nextQuestionKey resolves only through live questions",
  /nextQuestionKey:\s*o\.nextQuestionId\s*\?\s*liveQuestions\.find/.test(single),
);
check(
  "full catalog nextQuestionKey resolves only through live questions",
  /nextQuestionKey:\s*o\.nextQuestionId\s*\?\s*liveQuestions\.find/.test(catalog),
  "a live option must not point a fresh template at a retired question row",
);

check(
  "reference template writer persists NUMBER question bounds",
  /inputType:\s*q\.inputType,\s*numberMin:\s*q\.numberMin,\s*numberMax:\s*q\.numberMax/.test(single),
);
check(
  "full catalog template writer persists NUMBER question bounds",
  /inputType:\s*q\.inputType,\s*numberMin:\s*q\.numberMin,\s*numberMax:\s*q\.numberMax/.test(catalog),
  "carrying fields in memory is insufficient unless TemplateQuestion rows persist them",
);

check(
  "reference template writer persists numeric predicates and capability gate",
  single.includes("numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost") &&
    single.includes("requiresCapabilityKey: o.requiresCapabilityKey"),
);
check(
  "full catalog template writer persists numeric predicates and capability gate",
  catalog.includes("numberAtLeast: o.numberAtLeast, numberAtMost: o.numberAtMost") &&
    catalog.includes("requiresCapabilityKey: o.requiresCapabilityKey"),
  "TemplateAnswerOption must retain Routing V2 routing/capability semantics",
);

if (fail > 0) {
  console.error("\nFULL CATALOG EXTRACTION REMAINS BLOCKED. Do not run extract-template-catalog.ts --apply.\n");
}
console.log(`${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
