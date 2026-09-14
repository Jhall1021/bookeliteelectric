/**
 * Regression for the switch-leg double-charge fix (Decision Tree Audit V1,
 * finding B.2) — new-ceiling-light / new-ceiling-fan.
 *
 *   npx tsx scripts/verify-lighting-control-rewire.ts
 *
 * DB-FREE, AND DELIBERATE ABOUT WHAT THAT DOES AND DOESN'T PROVE.
 *
 * `prisma/seed-questions.ts` and `prisma/seed-lighting-control.ts` cannot be
 * imported directly without a database: both call `main()` unguarded at
 * module load (no `import.meta.url` check the way `capture-trade-electrical.ts`
 * has), so importing either constructs a real `PrismaClient` and tries to
 * connect. That's not something this harness can safely do without one.
 *
 * What it DOES do: import and run the actual, shared, production
 * `upsertQuestion` / `rewireTerminalsInto` / `findDanglingReferences` /
 * `findUnreachableQuestions` from `prisma/_moduleHelpers.ts` — the real
 * mechanism the fix depends on, not a reimplementation of it — against a
 * minimal in-memory fake of the two Prisma models those four functions
 * actually touch (`question`, `answerOption`). The service's own tree shape
 * is reproduced by hand, matching exactly what `seedNewCeilingLight()`
 * creates post-fix (attic_access → existing_light_source, with "No" now a
 * bare RESOLVE_INSTANT instead of CONTINUE → switched_source) — a faithful
 * fixture, not a re-derivation, of the real committed diff.
 *
 * This proves the REWIRING MECHANISM composes correctly against that shape.
 * It does not prove `seedNewCeilingLight()`'s own literals (labels, keys,
 * order numbers) are typed correctly in the real file — that's covered by
 * `npx tsc --noEmit` (the file compiles) and by direct reading (documented in
 * the commit and the audit). Running the real seed end-to-end against a real
 * database is the one thing this can't substitute for — see the
 * reconciliation doc for why that access wasn't available this session.
 */

import {
  upsertQuestion,
  rewireTerminalsInto,
  findDanglingReferences,
  findUnreachableQuestions,
} from "../prisma/_moduleHelpers";

let pass = 0;
let fail = 0;
function ok(label: string, condition: boolean, detail = "") {
  if (condition) {
    pass++;
    console.log(`  ok   ${label}`);
  } else {
    fail++;
    console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`);
  }
}

// ---------------------------------------------------------------------------
// A minimal in-memory fake of exactly the Prisma surface upsertQuestion /
// rewireTerminalsInto / findDanglingReferences / findUnreachableQuestions
// call — nothing more. Ids are assigned sequentially, mirroring cuid()'s
// "opaque, stable, referenceable" contract without needing the real thing.
// ---------------------------------------------------------------------------
type Question = { id: string; serviceId: string; key: string; prompt: string; helpText: string | null; order: number };
type AnswerOption = { id: string; questionId: string; label: string; value: string; routeAction: string; nextQuestionId: string | null; priceModifierCents: number };

class FakeDb {
  questions: Question[] = [];
  options: AnswerOption[] = [];
  private nextId = 1;
  private id(prefix: string) {
    return `${prefix}_${this.nextId++}`;
  }

  question = {
    findFirst: async ({ where }: { where: { serviceId: string; key: string } }) =>
      this.questions.find((q) => q.serviceId === where.serviceId && q.key === where.key) ?? null,
    findMany: async ({ where }: { where: { serviceId: string } }) =>
      // select shape (id/key, or id/key/options) doesn't matter to this fake —
      // it always returns full rows, same as the real callers' actual reads.
      this.questions
        .filter((q) => q.serviceId === where.serviceId)
        .map((q) => ({ ...q, options: this.options.filter((o) => o.questionId === q.id) })),
    update: async ({ where, data }: { where: { id: string }; data: Partial<Question> }) => {
      const q = this.questions.find((x) => x.id === where.id)!;
      Object.assign(q, data);
      return q;
    },
    create: async ({ data }: { data: Omit<Question, "id"> }) => {
      const q: Question = { id: this.id("q"), ...data };
      this.questions.push(q);
      return q;
    },
  };

  answerOption = {
    findMany: async ({ where }: { where: { questionId: { in: string[] } } }) =>
      this.options.filter((o) => where.questionId.in.includes(o.questionId)),
    updateMany: async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<AnswerOption> }) => {
      let count = 0;
      for (const o of this.options) {
        if (where.id.in.includes(o.id)) {
          Object.assign(o, data);
          count++;
        }
      }
      return { count };
    },
    createMany: async ({ data }: { data: Omit<AnswerOption, "id">[] }) => {
      for (const d of data) this.options.push({ id: this.id("a"), ...d });
      return { count: data.length };
    },
    deleteMany: async ({ where }: { where: { questionId: string } }) => {
      const before = this.options.length;
      this.options = this.options.filter((o) => o.questionId !== where.questionId);
      return { count: before - this.options.length };
    },
  };
}

const SERVICE_ID = "svc_new_ceiling_light";

/**
 * Reproduces exactly what seedNewCeilingLight() creates post-fix: attic
 * access → existing fixture, "No" now a bare terminal instead of continuing
 * to the removed switched_source. No priceModifierCents anywhere in this
 * base tree — matching the real committed diff, where the $150/$225 flat
 * modifiers were deleted along with the question, not moved.
 */
async function buildFixedBaseTree(db: FakeDb) {
  const qAttic = await db.question.create({
    data: { serviceId: SERVICE_ID, key: "attic_access", prompt: "Is there accessible attic space...?", helpText: null, order: 1 },
  });
  const qExisting = await db.question.create({
    data: { serviceId: SERVICE_ID, key: "existing_light_source", prompt: "Is there an existing light fixture...?", helpText: null, order: 2 },
  });
  await db.answerOption.createMany({
    data: [
      { questionId: qAttic.id, label: "Yes", value: "has_access", routeAction: "CONTINUE", nextQuestionId: qExisting.id, priceModifierCents: 0 },
      { questionId: qAttic.id, label: "No", value: "no_access", routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, priceModifierCents: 10000 },
    ],
  });
  await db.answerOption.createMany({
    data: [
      { questionId: qExisting.id, label: "Yes", value: "yes", routeAction: "RESOLVE_INSTANT", nextQuestionId: null, priceModifierCents: 0 },
      // THE FIX: was CONTINUE -> switched_source (priceModifierCents 15000/22500
      // lived on THAT question's own answers, not this one). Now a bare
      // terminal, eligible for rewireTerminalsInto exactly like "Yes" above.
      { questionId: qExisting.id, label: "No", value: "no", routeAction: "RESOLVE_INSTANT", nextQuestionId: null, priceModifierCents: 0 },
    ],
  });
  return { qAttic, qExisting };
}

/** The one module question this test needs to prove rewiring against — the
 *  real seed-lighting-control.ts attaches several more, irrelevant here. */
async function attachLightingControlModule(db: FakeDb) {
  const qControl = await upsertQuestion(db as never, SERVICE_ID, {
    key: "lighting_control",
    prompt: "How would you like the new light controlled?",
    order: 99, // real file computes this from `kept.length`; irrelevant to the graph shape being tested
  });
  // upsertQuestion (above) already deleted this question's own prior answers
  // on a re-run — real seed-lighting-control.ts relies on that same behavior
  // rather than clearing them itself, so this mirrors it exactly rather than
  // duplicating the clear.
  await db.answerOption.createMany({
    data: [
      { questionId: qControl.id, label: "Existing switched light", value: "existing_switched_light", routeAction: "RESOLVE_INSTANT", nextQuestionId: null, priceModifierCents: 0 },
      { questionId: qControl.id, label: "Convert a switched outlet", value: "convert_outlet", routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, priceModifierCents: 22000 },
      { questionId: qControl.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", nextQuestionId: null, priceModifierCents: 0 },
    ],
  });

  const { converted, repaired } = await rewireTerminalsInto(db as never, SERVICE_ID, qControl.id, ["lighting_control"]);
  return { qControl, converted, repaired };
}

async function main() {
  const db = new FakeDb();
  const { qAttic, qExisting } = await buildFixedBaseTree(db);

  // ---- First application: attach the module, exercising rewireTerminalsInto ----
  // Three terminals convert, not two: attic_access's own "No" (the flat
  // +$100 no-attic-access surcharge, unrelated to this fix and untouched by
  // it) was ALREADY rewired into the module before B.2 — this fixture proves
  // that unrelated behavior survives unchanged alongside the fix, not just
  // that the fix's own two terminals convert.
  const first = await attachLightingControlModule(db);
  ok("module attach converts all three base-tree terminals (attic_access No, existing_light_source Yes AND No)",
    first.converted === 3, `converted=${first.converted}`);

  {
    const atticNo = db.options.find((o) => o.questionId === qAttic.id && o.value === "no_access")!;
    ok("attic_access's own $100 no-access surcharge is untouched by this fix — still routes into the module, modifier intact",
      atticNo.routeAction === "CONTINUE" && atticNo.nextQuestionId === first.qControl.id && atticNo.priceModifierCents === 10000);
  }

  const existingAnswers = () => db.options.filter((o) => o.questionId === qExisting.id);

  // ---- Existing control: "Yes" now routes into the module, priced once ----
  {
    const yes = existingAnswers().find((a) => a.value === "yes")!;
    ok("existing-fixture path (control) now continues into lighting_control",
      yes.routeAction === "CONTINUE" && yes.nextQuestionId === first.qControl.id);
    ok("existing-fixture path carries no leftover flat modifier",
      yes.priceModifierCents === 0);
  }

  // ---- New switch-leg work: "No" also routes into the module, priced ONCE ----
  {
    const no = existingAnswers().find((a) => a.value === "no")!;
    ok("no-existing-fixture path (new switch-leg work) now continues into lighting_control",
      no.routeAction === "CONTINUE" && no.nextQuestionId === first.qControl.id);
    // THE ACTUAL BUG, negatively asserted: this answer must carry NO flat
    // modifier of its own. Before the fix, this same rewiring step would
    // have found switched_source's $150/$225 RESOLVE_ADJUSTED answers
    // (a question this fixture never creates, because the fix deletes it)
    // and converted THOSE too, stacking their priceModifierCents on top of
    // whatever the module's own components later added for the identical
    // switch-leg work. With switched_source gone, there is nothing left to
    // double-charge — proven here by there being no second RESOLVE_ADJUSTED
    // answer in this tree at all, and by this one carrying zero.
    ok("no-existing-fixture path carries no flat modifier — priced once, by the module's own components",
      no.priceModifierCents === 0);
  }

  // ---- Uncertainty / review: the module's own "not sure" branch -----------
  {
    const unsure = db.options.find((o) => o.questionId === first.qControl.id && o.value === "unsure")!;
    ok("the module's own uncertainty branch reviews rather than pricing",
      unsure.routeAction === "PHOTO_REVIEW");
  }

  // ---- Every required fact remains askable ---------------------------------
  ok("attic_access is still a real, answerable question", db.questions.some((q) => q.key === "attic_access"));
  ok("existing_light_source is still a real, answerable question", db.questions.some((q) => q.key === "existing_light_source"));
  ok("lighting_control (the module) is attached exactly once", db.questions.filter((q) => q.key === "lighting_control").length === 1);

  // ---- No dangling transitions or unreachable questions, via the REAL checks ----
  {
    const dangling = await findDanglingReferences(db as never, SERVICE_ID);
    const unreachable = await findUnreachableQuestions(db as never, SERVICE_ID);
    ok("no dangling references after the first module attach", dangling.length === 0, JSON.stringify(dangling));
    ok("no unreachable questions after the first module attach", unreachable.length === 0, JSON.stringify(unreachable));
  }

  // ---- Repeated seed/module application: idempotency ----------------------
  // Real contractors re-run seed-lighting-control.ts to adjust wording/prices
  // without meaning to change the tree's shape. Running attach() again must
  // not duplicate the question, re-widen what's already converted, or
  // reintroduce a dangling/unreachable state.
  const questionCountBefore = db.questions.length;
  const second = await attachLightingControlModule(db);
  ok("re-running the module attach does not create a second lighting_control question",
    db.questions.filter((q) => q.key === "lighting_control").length === 1);
  ok("re-running the module attach does not grow the question count",
    db.questions.length === questionCountBefore);
  ok("re-running converts nothing new — both terminals were already rewired the first time",
    second.converted === 0, `converted=${second.converted}`);
  {
    const dangling = await findDanglingReferences(db as never, SERVICE_ID);
    const unreachable = await findUnreachableQuestions(db as never, SERVICE_ID);
    ok("no dangling references after a REPEATED module attach", dangling.length === 0, JSON.stringify(dangling));
    ok("no unreachable questions after a REPEATED module attach", unreachable.length === 0, JSON.stringify(unreachable));
  }
  // The id survives the re-run (upsertQuestion's whole reason to exist) —
  // proven by both attaches returning the same question id.
  ok("lighting_control's id is stable across re-application (upsertQuestion, not delete+recreate)",
    first.qControl.id === second.qControl.id);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
