# Question-order repair — one controlled production step

**Status: PREPARED, NOT EXECUTED.** Nothing in this document has been run
against production except the read-only audit in §1. Every production step
below needs its own explicit approval, given in conversation, before it runs.

It makes `Question.order` unique within each service on production, and
re-captures the homepage hero from production in the same step. Nobody's
question sequence changes.

---

## 1. What production holds — read-only audit, 14 Sep 2026

The audit was run inside a `READ ONLY` transaction; Postgres refused a write
probe in that session. The identity marker was checked: `price2book-production`,
stamped for endpoint `ep-shy-butterfly-ay5t03di`, matching the connection.

It scanned 9 contractors, 304 services and 658 questions. Three services have
two questions at one position, all on `elite-electric`, all active and offered.
**None is tied at its starting position.**

| service | positions | tied at | lowest | served today (`order asc`, 5 reads, stable) |
|---|---|---|---|---|
| `recessed-lighting` | 0 1 2 3 3 4 5 6 7 8 10 11 | 3 | 0 | … `fixture_finish_ack@3` → `recessed_light_count@3` … |
| `swap-out-customer-supplied-non-smart-switch` | 0 1 1 | 1 | 0 | `switch_multi_location@1` → `smart_switch_model@1` |
| `new-120v-outlet` | 1 2 6 7 7 16 17 | 7 | 1 | `finished_space_both_sides@7` → `device_on_exterior_wall@7` |

**Sequencing finding.** On `recessed-lighting`, production serves
`fixture_finish_ack` before `recessed_light_count`. The new `id` tiebreak
(`QUESTION_ORDER`) would put them the other way round. So code that orders by
`QUESTION_ORDER` must not reach production while this tie exists. **The data
repair goes first.** Once positions are unique, the old rule and the new rule
serve the same order.

### The plan the audit derives

Walking the served order, each question keeps its position unless it would not
be strictly greater than the one before it:

| service | changes |
|---|---|
| `recessed-lighting` | `recessed_light_count` 3→4, `lighting_control` 4→5, `switch_near_power` 5→6, `lighting_dimmer_upgrade` 6→7, `below_above_access` 7→8, `finished_space_both_sides` 8→9 |
| `swap-out-customer-supplied-non-smart-switch` | `smart_switch_model` 1→2 |
| `new-120v-outlet` | `device_on_exterior_wall` 7→8 |

That is 8 rows. The rehearsal branch was repaired earlier from its own snapshot,
and it already holds exactly these positions for all three services.

## 2. Why the hero is part of the same step

`components/marketing/heroFlow.ts` was captured from production and embeds each
question's stored position. `new-120v-outlet`'s fifth question is committed at
position 7. After the repair it is 8. Rehearsal, already repaired, reports
`primary.dto.questions.4.order: committed 7 — live 8`, which is why
`capture-hero-flow --check` is red there.

The fixture must come from production, so it is re-captured from production
immediately after the repair, and the resulting diff must be exactly that one
position.

## 3. Rehearsed

`scripts/repair-duplicate-question-order.ts` ran the full step on rehearsal on
14 Sep 2026, against one disposable contractor with production-shaped ties
injected, which was removed afterwards. 22 of 22 checks passed:

- report mode writes nothing
- the capture records exactly the tied services
- apply refuses without the host named, and with a different host named
- apply commits in one transaction, leaves no ties anywhere, and keeps the captured served order
- `verify-question-order` passes afterwards
- rollback restores the captured positions, and refuses a second time
- apply refuses when any position changed since the capture
- a tie at a starting position is refused in report and capture modes

**Learned there: a rollback restores positions, not the order among ties.**
Postgres returns tied rows in physical order, and an UPDATE moves rows, so
after a rollback the order served among the reintroduced ties can differ from
before the repair. Treat rollback as a last resort and prefer a forward fix.
Never re-apply an old capture after a rollback; take a new one. The tool
refuses a stale capture anyway.

## 4. Preflight (report all nine; wait for approval)

1. Neon project: Price2Book `bitter-bird-20565072`.
2. Target branch: production, endpoint `ep-shy-butterfly-ay5t03di`, identity `price2book-production`.
3. Parent branch: none; no branch is created.
4. Operation: `UPDATE "Question" SET "order"` on the 8 rows in §1, in one transaction. Then a read-only hero capture.
5. Read-only or mutating: **mutating** (8 rows); the capture steps are read-only.
6. Can it affect production data: yes, the positions of 8 questions on 3 Elite services. No price, route, answer or service row is touched.
7. Why rehearsal is insufficient: the rows to repair are production's own, and so is the served order to preserve. Rehearsal was repaired from its own snapshot and has been dress-rehearsed (§3).
8. Expected result: the plan in §1 exactly; zero ties; the served order unchanged for all three services under both ordering rules; a hero fixture diff of exactly `questions[4].order 7 → 8`.
9. Rollback: `--rollback --snapshot` with the same capture file, in one transaction. It is subject to the limitation in §3.

## 5. The step

Run it from a clean checkout of the reviewed commit carrying this document.
Connection strings come from the environment, **never from arguments**, so they
never appear in a process listing.

```bash
# 0. environment: production DATABASE_URL from the main checkout's .env
set -a; . "/Users/eliteconstruction/Library/Mobile Documents/com~apple~CloudDocs/bookelite/.env"; set +a

# 1. identity — must print ok for price2book-production on ep-shy-butterfly-ay5t03di
npx tsx scripts/verify-database-identity.ts --expect price2book-production

# 2. capture (read-only) — the output must match §1 exactly; stop otherwise
npx tsx scripts/repair-duplicate-question-order.ts --capture release-question-order.json

# 3. apply — the host printed in step 2's header, typed deliberately
P2B_REPAIR_ALLOWED_HOST=<host printed above> \
  npx tsx scripts/repair-duplicate-question-order.ts --apply --snapshot release-question-order.json

# 4. confirm — no ties; the three services still served in the captured order
npx tsx scripts/repair-duplicate-question-order.ts

# 5. hero, from production (the capture script is read-only by construction)
npx tsx scripts/capture-hero-flow.ts
git diff --stat components/marketing/heroFlow.ts    # one position, 7 -> 8, nothing else
npx tsx scripts/capture-hero-flow.ts --check
```

Step 3 re-reads the served order and re-derives the plan inside its
transaction. It refuses unless both equal the capture exactly. After applying,
still inside the same transaction, it requires no ties anywhere, and each
service in the captured order under both `order asc` and `QUESTION_ORDER`.
Otherwise the whole step rolls back.

Record the capture file, the step 3 and 4 output, and the hero diff as evidence
alongside this document. Commit the re-captured fixture on its own and merge it
before rebasing any branch that relies on a green `capture-hero-flow --check`.
