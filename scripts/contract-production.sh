#!/usr/bin/env bash
# PRODUCTION CONTRACT — pass three. Steps 3-6 of the release.
#
# The same sequence rehearsed against br-noisy-surf-axvy9c0s, targeting
# production. Deliberately narrow: no deprecated-model removal, no
# infrastructure migration, no schema cleanup beyond what was rehearsed.
#
# Unlike the rehearsal this does NOT restore schema.prisma — the contracted
# schema is the new truth and is committed afterwards.
set -euo pipefail

EXPECTED_ENDPOINT="ep-icy-hill-axkgrsjb"
DB="$(npx tsx scripts/_print-env.ts DATABASE_URL)"
case "$DB" in
  *"$EXPECTED_ENDPOINT"*) ;;
  *) echo "ABORT: DATABASE_URL is not $EXPECTED_ENDPOINT"; exit 1;;
esac

echo "=============================================================="
echo " PRODUCTION CONTRACT — pass three"
echo " target: $(echo "$DB" | sed 's|^.*@||' | cut -d/ -f1)"
echo "=============================================================="

echo; echo "--- preconditions, one last time ---"
npx tsx scripts/contract-preflight.ts

echo; echo "--- 3a. transform schema.prisma to its contracted shape ---"
npx tsx scripts/apply-contract-schema.ts --write
npx prisma validate

echo; echo "--- 3b. prisma db push ---"
npx prisma db push --skip-generate --accept-data-loss
npx prisma generate >/dev/null

echo; echo "--- 4. create the OPEN-visit partial index, then ASSERT it ---"
npx tsx scripts/create-open-visit-index.ts --apply

echo; echo "--- 5a. snapshot AFTER and diff against the baseline ---"
npx tsx scripts/db-structure.ts snapshot /tmp/prod-after.json
npx tsx scripts/db-structure.ts diff /tmp/prod-before.json /tmp/prod-after.json

echo; echo "--- 5b. verify the production catalogue ---"
npx tsx scripts/verify-contract-applied.ts

echo; echo "--- 5c. prisma must report in sync, no flag ---"
npx prisma db push --skip-generate

echo
echo "=============================================================="
echo " CONTRACT APPLIED. schema.prisma is contracted and NOT reverted."
echo "=============================================================="
