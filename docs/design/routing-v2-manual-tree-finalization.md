# Routing V2 manual tree and precision correction

Status: implemented and locally verified; not a production or existing-catalog rollout.

Implementation commit: `7acc1fb`; preceding branch-guard commit: `d76ae31`.

## Ownership and branch boundary

The decision tree remains authoritative. Route Assist may supply observed answers to the same canonical questions a homeowner answers manually. It does not choose a service, diagnose, choose materials or labor, or calculate a price.

This change is based on `feat/electrical-routing-v2` at `b56d52bf00bfbae70a02832e1cbc2a20faec3489`, on a separate branch, `audit/electrical-tree-finalization-v2`. Its Git deployment is disabled in `vercel.json` alongside the existing Routing V2 guard. Neither active Route Assist branches nor the audit follow-through branch were modified.

Audit PR #56 (`audit/electrical-followthrough-v1`, last inspected at `3a9549c4e42ecbbeffca250fa8e82bd4a0314d16`) remains a separate integration dependency. Its whole history was not merged into this older Routing V2 baseline. The known Back restoration correction is carried here; this does not import or certify its session-save queue, session uniqueness migration, or troubleshooting changes.

## Corrected contract

| Canonical quantity | Domain | Meaning |
| --- | --- | --- |
| `surface_route_feet` | Decimal, existing 1–200 ft bounds | Measured visible route path |
| `accessible_route_feet` | Decimal, existing 1–300 ft bounds | Homeowner's approximate point-to-point distance through accessible attic/basement/crawlspace; contractor policy adds the ordinary end allowance, and a room scan still does not establish it |
| `concealed_route_feet` | Decimal, existing 1–300 ft bounds | Wall-path distance used by the existing finished-wall method; not a claim to have observed concealed wiring |
| Surface inside, outside and flat counts | Whole numbers, existing 0–20 bounds | Explicit physical fittings, independently counted; zero is an explicit answer |

`Question.numberAllowsDecimal` and `TemplateQuestion.numberAllowsDecimal` default to false. Existing bounded numeric questions retain integer behavior unless explicitly authored as measurements. Legacy unbounded dimension entry such as `8 x 8` remains supported.

No precision is rounded before routing. Plain decimal notation is accepted; units, ranges, signs, exponent notation, nonfinite values, out-of-domain values, and decimals that JavaScript would silently shorten are refused. A homeowner can choose “I'm not sure.” Existing minimum bounds are unchanged: this does not newly support sub-foot routes or round them up to one foot.

`AnswerOption.numberAtLeastExclusive` and its template counterpart default to false. Finished-wall routing now covers `[1,20]` and `(20,300]`. The previous integer intervals `[1,20]` and `[21,300]` would have left 20.5 without a route. Integer predicate endpoints remain integer schema columns; an open lower edge expresses the decimal interval without inventing a smallest decimal increment.

The shared selector rejects gaps, overlaps and malformed unknown options before choosing a route. `__unknown__` is an explicit, unbounded review answer, not zero, a range midpoint, or a measurement. Its blocking review semantics prevent preparatory-photo behavior from accidentally continuing into a price; the new numeric uncertainty exits require no photo labels.

## Tree authoring

The same six surface questions and existing identities remain shared by outlet, switch and fixture-box endpoints. Their endpoint recipes differ; their route questions and physical quantities do not. Prompts are shorter, and help text explains actual path measurements and physical corner geometry. A screen-space left/right bend establishes none of the fitting kinds.

Every measured/count question now has an uncertainty exit. Back-to-back requires facing locations on opposite sides of the wall; `sameWall` does not establish it. The accessible-route estimate can price an ordinary route once contractor economics are approved. Finished-wall/baseboard no longer asks the homeowner to diagnose whether trim is continuous, glued or built in: selecting baseboard includes careful removal and reinstall of reusable existing trim, while replacement, caulking and painting remain excluded. Required contractor capabilities remain unchanged.

No access-opening range is bound as an exact count. Turn totals alone still do not establish ordered segment lengths or offcut decisions, so those routes remain REVIEW. No scan task key, capture grouping, confidence threshold, handoff identifier or Route Assist database field enters the authored contract.

Browser input, stored-answer replay and the physical server resolver use the same selector. The derived-pricing adapter now preserves fractional route footage when assembling takeoff geometry; it previously reduced a fractional number to zero. Purchase-package rounding remains in takeoff, not in the measurement. No contractor economics or derived customer-price calculation moved into the browser.

The storefront service DTO, single-service extraction, whole-catalog extraction and new-contractor provisioning carry the metadata. Whole-catalog extraction also now preserves the existing numeric bounds, quantity bindings and capability requirements it previously omitted. Neither extraction CLI was executed against a catalog during this work.

## Verification record

Completed locally:

- TypeScript and a production `next build` (107 pages). The first build completed with default-auth-secret diagnostics; a second successful build used a randomly generated, temporary local auth secret without those diagnostics. No real auth credentials were used.
- The complete `verify:fast` script list, in order, via `node --import tsx`; the environment rejects the IPC socket created by the `tsx` CLI. No fast gate was skipped or changed to force success.
- `verify-routing-tree-contract.ts`: 410 assertions using the actual shared module authors, including all three endpoints, graph reachability, no loops/dangling edges, quantity-source reachability, fractional boundaries, uncertainty, stored-answer replay, integer fitting counts and turned-route takeoff refusal.
- Existing numeric-range and quantity-binding regressions: 34 and 40 assertions.
- `verify-routing-numeric-browser.ts`: 30 assertions driving the actual `QuestionStep` React component in Chromium, including decimal input, invalid input, unknown, whole counts and browser/server agreement at 20.5 ft. This is a module browser regression, not a full storefront checkout test.
- `verify-routing-precision-provisioning.ts`: 25 assertions against fresh PostgreSQL-compatible PGlite storage through Prisma. Real template rows pass through production `installCatalog`, then the actual resolver. A second disposable contractor uses the supported material, labor, pricing, approval and activation lifecycle. A fractional straight route reaches PRICED, has a complete takeoff preserving 14.625 ft, becomes REVIEW after a material cost changes, and prices again after reapproval. A turn without segment geometry remains REVIEW. Evaluation writes no visit, line item or booking.

The database test requires a loopback URL, a stamped `local-*` identity, and an empty contractor/catalog inventory before mutations. The test owns its entire disposable database; discard that database after the run. It is deliberately not an existing-catalog migration tool. PGlite's single-session transport is not evidence about real PostgreSQL concurrency. Temporary browser and database runtime dependencies were installed outside the repository; only esbuild, used to bundle the actual React component regression, is a new development dependency.

Not claimed green: the full `verify:pilot`/`verify:full` chains, all 75 Electrical services in a fully composed seeded catalog, fresh authenticated deployed onboarding, booking snapshots for this revision, existing-contractor adoption, or Route Assist integration. Standalone attempts to run the existing material-takeoff and pilot-eligibility suites stopped at their database dependency without a configured fixture database; they are not counted as passes. The focused database proof above subsequently used its own isolated fixture. The existing full storefront suites were updated for the authored wording but were not executed here.

## Schema and catalog rollout — design only

Before any deployment of code that selects the new columns, apply the additive schema change to an isolated rehearsal database and review schema compatibility. Required additions, all non-null booleans with a false default:

- `questions.numberAllowsDecimal`
- `template_questions.numberAllowsDecimal`
- `answer_options.numberAtLeastExclusive`
- `template_answer_options.numberAtLeastExclusive`

No existing answer or price column changes type. Adding columns does not update an existing tree. Do not globally enable decimals on NUMBER questions: fitting counts and unrelated legacy questions must remain whole-number domains.

Reauthor only reviewed canonical module instances, preserving question IDs and surrounding module composition. Compare complete question/option/component/binding/capability structure against a captured baseline; refuse customized or drifted trees. Decimal metadata and the finished-wall open-edge option must be adopted together. Review exact extraction diffs before publishing a template version. New-contractor provisioning can consume that version; existing-contractor adoption is a separate scoped, transactional operation that still needs implementation and rehearsal. No broad seed runner is provided or authorized here.

Before release, reconcile audit PR #56 and the separately owned Route Assist adapter correction without replacing newer files with this older branch's versions. Legacy 2-D corner observations must not become physical fitting quantities. This branch certifies manual authoring and numeric semantics, not that older Route Assist code on its base is safe to ship.

Then run the composed-catalog and full storefront gates on the reconciled revision, including manual completion without Route Assist, stale-price refusal, Add-to-Visit price reconciliation, and immutable booking snapshots. A guarded Preview rebuild and production/catalog rollout remain separate actions. Nothing in this document authorizes merging, enabling deployment, seeding a real catalog, extracting a live template, or touching production services.
