/**
 * What each AppointmentKind MEANS, and what G3 deliberately did not do.
 *
 * THE INVARIANT
 *
 *   When an Appointment is SERVICE_CALL, it represents an attended visit whose
 *   purpose is to ESTABLISH the scope of work. It is distinct from PRE_WORK,
 *   which VERIFIES an already-defined scope. A service call never satisfies a
 *   pre-work requirement, and a booking may legitimately contain both.
 *
 * WHY A VERIFIER AND NOT A COMMENT
 *
 * The distinction is invisible at the type level — both are members of one
 * enum, and nothing stops a future writer using either. What makes the rule
 * hold is that pre-work satisfaction is decided by `PreWorkVisit.scopeState`
 * and by nothing else, which is a property of shipped code rather than of a
 * convention. This asserts that property against the real function.
 *
 * NO DATABASE, NO NETWORK. Everything below reads the schema text, the
 * plumbing template's declarations, and the repository's own source. That
 * matters for G3 specifically: the enum value is not yet applied to any
 * database, and a proof that needed it applied would have forced the DDL
 * before anybody had reviewed it.
 *
 * NO PARALLEL PRE-WORK IMPLEMENTATION. The pre-work assertions call the
 * shipped `installationMayProceed`. A second copy of that logic here would
 * prove the copy, and the copy is the thing that would drift.
 *
 *   npx tsx scripts/verify-appointment-kinds.ts
 */

import { readFileSync } from "node:fs";
import { installationMayProceed } from "../lib/preWorkVisit";
import {
  PLUMBING_APPOINTMENT_SHELLS,
  appointmentShell,
  shellIsSchedulable,
} from "../lib/plumbing/appointments";

let failures = 0;
let checks = 0;
function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}
function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");

/** The enum's members, read from the schema rather than from a mirror of it. */
function appointmentKinds(): string[] {
  // `[\s\S]` rather than the `s` flag: this project's TS target predates it.
  const m = SCHEMA.match(/^enum AppointmentKind \{([\s\S]*?)^\}/m);
  if (!m) throw new Error("enum AppointmentKind not found in prisma/schema.prisma");
  return m[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("///") && !l.startsWith("//"));
}

// ---------------------------------------------------------------------------

function schemaDeclaration() {
  group("THE SHARED ENUM");
  const kinds = appointmentKinds();
  console.log(`  AppointmentKind = ${kinds.join(", ")}`);

  for (const k of ["PRE_WORK", "INSTALLATION", "SERVICE_CALL"]) {
    ok(`declares ${k}`, kinds.includes(k));
  }
  // Three, and three is the whole set. A fourth arriving unannounced is a
  // decision somebody made without this file noticing.
  ok("three kinds, and no fourth", kinds.length === 3, kinds.join(", "));

  // The name carries the boundary. DIAGNOSTIC would assert a fault exists to
  // be found, which is the conclusion nobody has reached when the visit is
  // booked — and an enum value outlives every rewording above it.
  ok("no kind names a conclusion about why the visit happens",
    !kinds.some((k) => /DIAGNOS|FAULT|REPAIR|TROUBLESHOOT/i.test(k)), kinds.join(", "));
}

function distinctness() {
  group("SERVICE_CALL ≠ PRE_WORK");

  const verification = appointmentShell("verification");
  const installation = appointmentShell("installation");
  const serviceCall = appointmentShell("on_site_service");

  ok("Plumbing verification maps to PRE_WORK", verification.platformKind === "PRE_WORK",
    String(verification.platformKind));
  ok("Plumbing installation maps to INSTALLATION", installation.platformKind === "INSTALLATION",
    String(installation.platformKind));
  ok("Plumbing on-site service maps to SERVICE_CALL", serviceCall.platformKind === "SERVICE_CALL",
    String(serviceCall.platformKind));

  ok("the three shells hold three different kinds",
    new Set([verification.platformKind, installation.platformKind, serviceCall.platformKind]).size === 3);
  ok("all three are schedulable against the schema",
    PLUMBING_APPOINTMENT_SHELLS.every(shellIsSchedulable));
  ok("and none still records an outstanding schema change",
    PLUMBING_APPOINTMENT_SHELLS.every((s) => s.requiresSchemaChange === null));

  // What each shell BLOCKS is the semantic difference, and it survived G3.
  // A service call produces a scope, so it gates PRICING. A verification
  // confirms a scope that was already sold, so it gates INSTALLATION.
  ok("the service call blocks PRICING — it produces a scope", serviceCall.blocks === "PRICING",
    String(serviceCall.blocks));
  ok("the verification blocks INSTALLATION — it confirms one", verification.blocks === "INSTALLATION",
    String(verification.blocks));
  ok("they do not block the same thing", serviceCall.blocks !== verification.blocks);
}

function neverSatisfiesPreWork() {
  group("A SERVICE CALL NEVER SATISFIES A PRE-WORK REQUIREMENT");

  // THE MECHANISM, not a restatement of it.
  //
  // `installationMayProceed` takes no appointment kind. It cannot: pre-work
  // satisfaction is decided by `PreWorkVisit.scopeState`, and a SERVICE_CALL
  // appointment creates no PreWorkVisit row — so the state a service call
  // leaves behind is exactly `null`, which this function blocks on.
  //
  // That is why the invariant holds structurally rather than by discipline,
  // and it is asserted against the shipped function rather than a copy.
  const afterServiceCallOnly = installationMayProceed({
    requiresPreWorkVisit: true,
    installationRequiresPreWorkCompletion: true,
    // What a booking looks like when a service call has happened and no
    // pre-work visit has: no PreWorkVisit row, therefore no scope state.
    scopeState: null,
  });
  ok("a gated service with no pre-work record does NOT proceed",
    afterServiceCallOnly.allowed === false, afterServiceCallOnly.reason);
  ok("and says the workflow has not started rather than passed",
    /no pre-work visit has been recorded/i.test(afterServiceCallOnly.reason),
    afterServiceCallOnly.reason);

  // The only things that DO satisfy it, so the assertion above is not merely
  // "this function returns false".
  for (const state of ["STANDARD_SCOPE_VERIFIED", "EXCEPTION_RESOLVED"] as const) {
    ok(`${state} does satisfy it`,
      installationMayProceed({
        requiresPreWorkVisit: true,
        installationRequiresPreWorkCompletion: true,
        scopeState: state,
      }).allowed === true);
  }
  for (const state of ["PENDING_VERIFICATION", "OUT_OF_SCOPE_REVIEW"] as const) {
    ok(`${state} does not`,
      installationMayProceed({
        requiresPreWorkVisit: true,
        installationRequiresPreWorkCompletion: true,
        scopeState: state,
      }).allowed === false);
  }

  // BOTH ON ONE BOOKING. A service call establishes the work; a pre-work visit
  // later verifies whatever it established. Neither substitutes for the other:
  // the second is what moves the scope state, and the first cannot.
  const afterBoth = installationMayProceed({
    requiresPreWorkVisit: true,
    installationRequiresPreWorkCompletion: true,
    scopeState: "STANDARD_SCOPE_VERIFIED",
  });
  ok("a booking may hold a service call AND, later, a pre-work verification",
    afterServiceCallOnly.allowed === false && afterBoth.allowed === true,
    "only the verification moves the gate, which is the substitution this forbids");
}

function noProductionWriter() {
  group("G3 ADDED NO PRODUCTION WRITER");

  // The capability exists; nothing uses it yet. Asserted over source rather
  // than trusted, because "we did not wire it up" is exactly the kind of claim
  // that stops being true without anybody deciding it should.
  const sources = process.env.G3_SOURCES
    ? process.env.G3_SOURCES.split(",")
    : ["app", "lib", "components"];
  const writers: string[] = [];
  const walk = (dir: string) => {
    let entries: string[] = [];
    try {
      entries = require("node:fs").readdirSync(dir, { withFileTypes: true }) as never;
    } catch {
      return;
    }
    for (const e of entries as unknown as { name: string; isDirectory(): boolean }[]) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        const text = readFileSync(full, "utf8");
        // A write is `kind: "SERVICE_CALL"` reaching an appointment create.
        // The plumbing template DECLARES the kind rather than writing one, so
        // `platformKind:` is not a writer and is excluded by the pattern.
        if (/\bkind\s*:\s*["']SERVICE_CALL["']/.test(text)) writers.push(full);
      }
    }
  };
  for (const d of sources) walk(d);

  ok("no production file writes an appointment with kind SERVICE_CALL",
    writers.length === 0, writers.join(", "));

  // The one appointment writer that exists is unchanged and still PRE_WORK.
  const checkout = readFileSync("app/api/checkout/route.ts", "utf8");
  ok("the sole appointment writer (checkout) still writes PRE_WORK",
    /kind:\s*"PRE_WORK"/.test(checkout));
  ok("and checkout does not mention SERVICE_CALL at all",
    !/SERVICE_CALL/.test(checkout));

  // Booking.arrivalWindowId remains the scheduling mechanism. G3 did not move
  // reads onto the Appointment table.
  ok("Booking still carries arrivalWindowId as the scheduling field",
    /model Booking \{[\s\S]*?arrivalWindowId\s+String/.test(SCHEMA));
}

function noElectricalMigration() {
  group("ELECTRICAL IS UNCHANGED — the two representations coexist deliberately");

  // Electrical models a diagnostic as a TroubleshootingSession with no
  // Appointment row. G3 does not unify the two, and that is a decision rather
  // than an oversight: converting it is behavior change on live bookings for
  // no benefit this change delivers.
  ok("TroubleshootingSession still exists in the schema",
    /^model TroubleshootingSession \{/m.test(SCHEMA));
  ok("and BookingType.TROUBLESHOOT_ONLY is untouched",
    /enum BookingType \{[\s\S]*?TROUBLESHOOT_ONLY/.test(SCHEMA));

  // Nothing converts one into the other.
  const converters: string[] = [];
  const walk = (dir: string) => {
    let entries: unknown[] = [];
    try {
      entries = require("node:fs").readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries as { name: string; isDirectory(): boolean }[]) {
      const full = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(e.name)) {
        const t = readFileSync(full, "utf8");
        if (/troubleshootingSession/i.test(t) && /SERVICE_CALL/.test(t)) converters.push(full);
      }
    }
  };
  for (const d of ["app", "lib", "components", "prisma"]) walk(d);
  ok("no code converts a TroubleshootingSession into a SERVICE_CALL appointment",
    converters.length === 0, converters.join(", "));
}

function main() {
  console.log("\n\x1b[1mAPPOINTMENT KINDS\x1b[0m");
  console.log("No database, no network. Schema text, template declarations, and source.");

  schemaDeclaration();
  distinctness();
  neverSatisfiesPreWork();
  noProductionWriter();
  noElectricalMigration();

  console.log(
    `\n${failures === 0 ? "\x1b[32m" : "\x1b[31m"}${checks - failures}/${checks} checks passed\x1b[0m\n`
  );
  if (failures > 0) process.exit(1);
}

main();
