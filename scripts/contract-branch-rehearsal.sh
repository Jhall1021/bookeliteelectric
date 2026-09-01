#!/usr/bin/env bash
# Full contract rehearsal against a Neon branch.
#
# Runs the REAL production procedure — the actual schema.prisma and a real
# `prisma db push` — against a throwaway branch, then verifies the branch
# database itself. Nothing here touches production; every step that talks to a
# database uses REHEARSAL_DATABASE_URL, and the script refuses to run unless
# that target has been PROVED to be a branch of the current production lineage.
#
# THE GUARD THIS REPLACED WAS WRONG FOR FIVE DAYS.
#
# It refused a URL containing `ep-icy-hill-axkgrsjb`. That endpoint stopped
# being production on 28 August 2026, so from that day the check protected
# nothing: it accepted any host that merely was not the OLD one — including
# current production, whose entire schema this script pushes over with
# --accept-data-loss.
#
# A denylist of one hostname is not a safety property. The target is now judged
# by LINEAGE (Neon's system_identifier, identical across branches of a project
# and different between projects) plus the DatabaseIdentity marker, which
# separates the stamped original from a branch of it. Positive test: a target
# is accepted only once shown to be a production branch, never for failing to
# match a denylist. See scripts/_lineage.ts.
#
# Restores prisma/schema.prisma on exit, however it exits.
set -euo pipefail

# Load .env so REHEARSAL_DATABASE_URL can live there rather than being
# exported by hand. A var in .env is NOT visible to `npx tsx` otherwise —
# verified with a probe, not assumed. An already-set value still wins.
# Do NOT `source` the dotenv files. They hold values with shell
# metacharacters — PLATFORM_FROM_EMAIL is a display name in angle brackets,
# which bash reads as a redirect and rejects outright. Ask the TS loader,
# which parses with a regex and is the same code the scripts themselves use.
if [ -z "${REHEARSAL_DATABASE_URL:-}" ]; then
  REHEARSAL_DATABASE_URL="$(npx tsx scripts/_print-env.ts REHEARSAL_DATABASE_URL)"
  export REHEARSAL_DATABASE_URL
fi

: "${REHEARSAL_DATABASE_URL:?REHEARSAL_DATABASE_URL is not set — see docs/migration/pass-three-contract-plan.md}"
# Proves the target is a branch of production and not production itself, the
# archive, an unrelated database, or one that cannot be identified at all.
# Exits non-zero with a reason; `set -e` stops the rehearsal here.
npx tsx scripts/verify-rehearsal-target.ts

BEFORE=/tmp/branch-before.json
AFTER=/tmp/branch-after.json
restore() { git checkout -- prisma/schema.prisma 2>/dev/null || true; npx prisma generate >/dev/null 2>&1 || true; }
trap restore EXIT

echo "=============================================================="
echo " CONTRACT BRANCH REHEARSAL"
echo " target: $(echo "$REHEARSAL_DATABASE_URL" | sed 's|^.*@||' | cut -d/ -f1)"
echo "=============================================================="

echo; echo "--- 0. the branch must actually mirror production ---"
# A rehearsal against an empty branch does not fail, it passes vacuously:
# db push builds every table from scratch, every contracted column is NOT NULL
# because no row violates it, and every constraint applies because there is no
# data. That is a confident all-clear that proves nothing. Verified first.
npx tsx scripts/verify-rehearsal-branch.ts

echo; echo "--- 1. snapshot the branch BEFORE ---"
npx tsx scripts/db-structure.ts snapshot "$BEFORE" --rehearsal

echo; echo "--- 2. preflight against the branch ---"
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/contract-preflight.ts

echo; echo "--- 3. transform schema.prisma to its contracted shape ---"
npx tsx scripts/apply-contract-schema.ts --write
npx prisma validate

echo; echo "--- 4. prisma db push (the real deployment mechanism) ---"
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx prisma db push --skip-generate --accept-data-loss
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx prisma generate >/dev/null

echo; echo "--- 5. create the OPEN-visit partial index, then ASSERT it ---"
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/create-open-visit-index.ts --apply

echo; echo "--- 6. snapshot the branch AFTER, and diff ---"
npx tsx scripts/db-structure.ts snapshot "$AFTER" --rehearsal
npx tsx scripts/db-structure.ts diff "$BEFORE" "$AFTER"

echo; echo "--- 7. verify the contracted state from the catalogue ---"
npx tsx scripts/verify-contract-applied.ts --rehearsal

echo; echo "--- 8. prisma must now report in sync, with no flag ---"
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx prisma db push --skip-generate

echo; echo "--- 8.5. THE APPLICATION MUST BUILD AGAINST THE CONTRACTED SCHEMA ---"
#
# Added after the pass-three contract caused a production incident this step
# would have prevented.
#
# The rehearsal proved PostgreSQL would accept the new schema. It never asked
# whether the application we were about to deploy could still COMPILE against
# it. It could not: a required column must appear in every Prisma `create`,
# and the tenant guard's runtime stamping is invisible to the compiler. The
# recovery deploy failed on 26 type errors, and production ran on a client
# generated from the OLD schema — still selecting a column the contract had
# just dropped — for 25 minutes.
#
# Deliberately AFTER the destructive changes, not before. Building against the
# pre-contract schema is what we already do on every commit and proves nothing
# about the contracted one.
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx prisma generate >/dev/null
DATABASE_URL="$REHEARSAL_DATABASE_URL" npm run build

echo; echo "--- 9. verifiers and harness against the BRANCH ---"
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/verify-tenant-indexes.ts
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/verify-booking-tenancy.ts
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/verify-checkout-atomicity.ts
DATABASE_URL="$REHEARSAL_DATABASE_URL" npx tsx scripts/verify-tenant-isolation-live.ts

echo
echo "=============================================================="
echo " REHEARSAL COMPLETE — schema.prisma restored on exit"
echo "=============================================================="
