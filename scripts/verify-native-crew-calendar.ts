import { readFileSync } from "node:fs";
import { nativeCapacity, nativeWindowAvailability, nativeWindowHasRoom } from "../lib/nativeScheduling";

let failures = 0;
function ok(label: string, condition: boolean) {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "✓" : "✗"} ${label}`);
}

function fakeDb({ legacy = 2, roster = 0, active = 0, bookings = 0,
  blocks = [] as { crewId: string; startTime: string; endTime: string }[] } = {}) {
  return {
    contractor: { findUnique: async () => ({ nativeConcurrentJobs: legacy }) },
    nativeCrew: { count: async ({ where }: any) => where.active === true ? active : roster },
    nativeCrewBlock: { findMany: async () => blocks },
    booking: { findMany: async () => Array.from({ length: bookings }, () => ({
      arrivalWindow: { startTime: "08:00", endTime: "11:00" },
    })) },
  } as any;
}

async function main() {
  console.log("\nNATIVE CREW CALENDAR — named capacity and outside-work blocks\n");
  ok("1. legacy numeric capacity remains valid before a roster is created",
    await nativeCapacity(fakeDb(), "contractor") === 2);
  ok("2. active named crews replace the legacy number once a roster exists",
    await nativeCapacity(fakeDb({ legacy: 9, roster: 3, active: 2 }), "contractor") === 2);
  ok("3. a roster with no active crews refuses booking capacity",
    await nativeCapacity(fakeDb({ roster: 2, active: 0 }), "contractor") === null);

  const window = { start: "08:00", end: "11:00" };
  const oneBlocked = fakeDb({ roster: 2, active: 2,
    blocks: [{ crewId: "crew-a", startTime: "09:00", endTime: "10:00" }] });
  const availability = await nativeWindowAvailability(oneBlocked, "contractor", "2030-06-05", [window], () => true);
  ok("4. one blocked crew still leaves one crew available in a two-crew roster",
    availability[0]?.available === true);

  const blockedAndBooked = fakeDb({ roster: 2, active: 2, bookings: 1,
    blocks: [{ crewId: "crew-a", startTime: "09:00", endTime: "10:00" }] });
  ok("5. one blocked crew plus one Price2Book booking fills two-crew capacity",
    !(await nativeWindowHasRoom(blockedAndBooked, "contractor", "2030-06-05", "08:00", "11:00")));

  const duplicateBlocks = fakeDb({ roster: 2, active: 2, blocks: [
    { crewId: "crew-a", startTime: "08:00", endTime: "09:30" },
    { crewId: "crew-a", startTime: "09:00", endTime: "10:00" },
  ] });
  const duplicateResult = await nativeWindowAvailability(duplicateBlocks, "contractor", "2030-06-05", [window], () => true);
  ok("6. overlapping blocks for one crew consume one unit, never two", duplicateResult[0]?.available === true);

  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const route = readFileSync("app/api/admin/native-schedule/route.ts", "utf8");
  const page = readFileSync("app/dashboard/business-hours/page.tsx", "utf8");
  ok("7. crew and block rows are contractor-owned and cascade with the contractor",
    /model NativeCrew[\s\S]*contractorId String[\s\S]*onDelete: Cascade/.test(schema) &&
      /model NativeCrewBlock[\s\S]*contractorId String[\s\S]*onDelete: Cascade/.test(schema));
  ok("8. every schedule write uses authenticated contractor context",
    /withAdminRoute/.test(route) && !/platformDb|from "@\/lib\/prisma"/.test(route));
  ok("9. the crew calendar is available only for native scheduling",
    /authority === "NATIVE"/.test(page) && /connected scheduling system controls crew availability/.test(page));

  console.log(failures ? `\n  ${failures} check(s) failed.\n` : "\n  Native capacity now accounts for work booked outside Price2Book.\n");
  if (failures) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
