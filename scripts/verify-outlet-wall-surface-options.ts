import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-new-outlet-v2.ts", "utf8");

assert.match(seed, /prompt: "Is the wall surface drywall\?"/);
assert.match(seed, /label: "Yes — drywall", value: "drywall"/);
assert.match(seed, /label: "No — another finish", value: "other_finish"/);
assert.match(seed, /label: "I'm not sure", value: "unsure"/);
assert.doesNotMatch(seed, /\["(?:plaster|tile|stone_masonry|wood_panel|decorative|other)"/);

console.log("outlet wall surface: one drywall path, one other-finish review path, and one unsure path");
