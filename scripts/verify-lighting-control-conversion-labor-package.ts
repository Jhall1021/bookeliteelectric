import assert from "node:assert/strict";
import { LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE } from "../lib/electrical/lightingControlConversionLaborPackage";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; };
const pkg = LIGHTING_CONTROL_CONVERSION_LABOR_PACKAGE;

ok(pkg.componentKeys.length === 2, "both access labels share one conversion recipe");
ok(Math.abs(pkg.laborHours - 0.36) < 1e-9, "conversion totals 0.36 atomic crew-hours");
ok(pkg.scheduleMinutes === 22, "conversion schedule comes from the same atomic hours");
ok(pkg.quantities.ELEC_RECONFIGURE_SWITCHED_RECEPTACLE === 1, "conversion remakes one switched receptacle to constant power");
ok(pkg.quantities.ELEC_TERMINATE_SWITCH === 1, "conversion reconnects one existing switch for the lighting control");
ok(Object.keys(pkg.quantities).every((key) => !key.includes("CABLE") && !key.includes("DRILL") && !key.includes("DRYWALL")), "conversion does not duplicate host cable-route or access labor");

console.log(`LIGHTING CONTROL CONVERSION LABOR PACKAGE — ${checks}/${checks} checks passed`);
