import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

console.log("\nROUTE ASSIST PHONE CONTINUATION — SOURCE CONTRACT\n");

const resolveRoute = readFileSync("app/api/device-handoffs/resolve/route.ts", "utf8");
const client = readFileSync("lib/routeAssistHandoffClient.ts", "utf8");
const landing = readFileSync("components/route-assist/HandoffLanding.tsx", "utf8");

check(
  "handoff resolve derives continuation from the session's exact service",
  /where:\s*\{\s*id:\s*session\.serviceId\s*\}/.test(resolveRoute) &&
    /service\.slug\s*!==\s*session\.serviceSlug/.test(resolveRoute)
);
check(
  "handoff resolve returns a canonical category/service continuation path",
  /continuationPath:\s*`services\/\$\{categorySlug\}\/\$\{session\.serviceSlug\}`/.test(resolveRoute)
);
check(
  "client contract requires continuationPath",
  /continuationPath:\s*string/.test(client)
);
check(
  "phone done state retains the server-issued continuation path",
  /kind:\s*"done";\s*continuationPath:\s*string/.test(landing) &&
    /continuationPath:\s*handoff\.continuationPath/.test(landing)
);
check(
  "Continue on this phone navigates through the current storefront base",
  /router\.push\(`\$\{base\}\/\$\{state\.continuationPath\}`\)/.test(landing)
);
check(
  "the old not-wired phone dead end is gone",
  !/isn't wired up yet|isn.t wired up yet/i.test(landing)
);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
