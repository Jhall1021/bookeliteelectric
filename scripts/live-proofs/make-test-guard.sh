#!/bin/bash
#
# Build the TEST guard from the reviewed one, and record what makes them differ.
#
#   bash scripts/live-proofs/make-test-guard.sh <owner> <repo> <ref> <out-dir>
#
# The reviewed guard hard-codes OWNER/REPO/REF and compares them against
# VERCEL_GIT_REPO_OWNER / _SLUG / _COMMIT_REF. On a disposable repository an
# unmodified guard refuses WRONG_OWNER before reaching anything the proofs are
# about, so the tested artifact is a modified copy BY CONSTRUCTION.
#
# That is only acceptable while the modification is exactly those three
# constants. This script proves it: it regenerates the file, diffs it against
# the reviewed one, and REFUSES if anything else moved. The proofs are about the
# reviewed guard's behaviour, not a variant's.
set -uo pipefail

REVIEWED="scripts/provenance-guard.sh"

# THE REVIEWED ARTIFACT, PINNED. Diffing the test guard against whatever
# provenance-guard.sh happens to contain proves only that the copy matches its
# source — tamper the source and the copy inherits it silently. The hash the
# review actually covered is therefore named here.
EXPECTED_REVIEWED="2e6e4b289b57a49579cef88ee1f7bfffc5786bf8"

# --verify re-checks an artifact that was already generated. Generating and
# checking in one shot blesses a file at one instant and says nothing about what
# is served later, so this is run again against the artifact actually uploaded.
if [ "${1:-}" = "--verify" ]; then
  out="${2:-}"
  [ -n "$out" ] || { echo "usage: bash $0 --verify <out-dir>" >&2; exit 2; }
  tg="$out/provenance-guard.test.sh"; rec="$out/guard-identity.txt"
  [ -f "$tg" ] && [ -f "$rec" ] || { echo "REFUSING: no recorded artifact in $out" >&2; exit 1; }
  now=$(git hash-object "$tg")
  was=$(sed -n 's/^  test blob  *//p' "$rec")
  echo "recorded test blob  $was"
  echo "artifact now        $now"
  [ "$now" = "$was" ] || {
    echo "REFUSING: the artifact changed after it was recorded" >&2; exit 1; }
  bad=$(diff "$REVIEWED" "$tg" | grep '^[<>]' | grep -vE '^[<>] (OWNER|REPO|REF)=' | wc -l | tr -d ' ')
  [ "$bad" -eq 0 ] || {
    echo "REFUSING: $bad line(s) differ from the reviewed guard beyond the constants" >&2; exit 1; }
  echo "ok: unchanged since recording, and still differs only in the constants"
  exit 0
fi

owner="${1:-}"; repo="${2:-}"; ref="${3:-}"; out="${4:-}"
[ -n "$owner" ] && [ -n "$repo" ] && [ -n "$ref" ] && [ -n "$out" ] || {
  echo "usage: bash $0 <owner> <repo> <ref> <out-dir>" >&2
  echo "       bash $0 --verify <out-dir>" >&2; exit 2; }
[ -f "$REVIEWED" ] || { echo "REFUSING: $REVIEWED not found" >&2; exit 1; }

actual_reviewed=$(git hash-object "$REVIEWED")
if [ "$actual_reviewed" != "$EXPECTED_REVIEWED" ]; then
  echo "REFUSING: $REVIEWED is not the reviewed artifact." >&2
  echo "  expected $EXPECTED_REVIEWED" >&2
  echo "  found    $actual_reviewed" >&2
  echo "Every proof is reported against the reviewed guard's behaviour; this is not it." >&2
  exit 1
fi

mkdir -p "$out"
test_guard="$out/provenance-guard.test.sh"

# Anchored at line start so only the constant assignments are touched.
sed -e "s|^OWNER=.*$|OWNER=$owner|" \
    -e "s|^REPO=.*$|REPO=$repo|" \
    -e "s|^REF=.*$|REF=$ref|" \
    "$REVIEWED" > "$test_guard"

reviewed_hash=$(git hash-object "$REVIEWED")
test_hash=$(git hash-object "$test_guard")

# THE CHECK, in two halves. Counting differing lines was the obvious rule and it
# was wrong: a substitution can be a no-op (REF=main -> main changes nothing),
# and a correct run would have been refused for it. So instead —
#
#   nothing outside the three constants may differ, AND
#   each constant must actually HOLD its intended value.
#
# The second half is what a line count was standing in for, and it is true
# whether or not the substitution changed anything.
unexpected=$(diff "$REVIEWED" "$test_guard" | grep '^[<>]' \
  | grep -vE '^[<>] (OWNER|REPO|REF)=' | wc -l | tr -d ' ')

wrong=""
grep -qx "OWNER=$owner" "$test_guard" || wrong="$wrong OWNER"
grep -qx "REPO=$repo"   "$test_guard" || wrong="$wrong REPO"
grep -qx "REF=$ref"     "$test_guard" || wrong="$wrong REF"

record="$out/guard-identity.txt"
{
  echo "GUARD IDENTITY — recorded before any build"
  echo "  recorded at        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  reviewed artifact  $REVIEWED"
  echo "  reviewed blob      $reviewed_hash"
  echo "  test blob          $test_hash"
  echo "  substitutions      OWNER=$owner REPO=$repo REF=$ref"
  echo "  lines differing    $(diff "$REVIEWED" "$test_guard" | grep -c '^[<>]') (a no-op substitution legitimately differs by none)"
  echo
  echo "DIFF (reviewed -> test)"
  diff "$REVIEWED" "$test_guard" | sed 's/^/  /'
} > "$record"

echo "reviewed blob  $reviewed_hash"
echo "test blob      $test_hash"
echo "record         $record"

if [ "$unexpected" -ne 0 ]; then
  echo >&2
  echo "REFUSING: $unexpected line(s) differ beyond the three constants." >&2
  echo "The tested artifact would not be the reviewed guard's behaviour." >&2
  diff "$REVIEWED" "$test_guard" | grep '^[<>]' | grep -vE '^[<>] (OWNER|REPO|REF)=' | sed 's/^/  /' >&2
  exit 1
fi
if [ -n "$wrong" ]; then
  echo >&2
  echo "REFUSING: these constants do not hold the intended value:$wrong" >&2
  echo "A constant that did not substitute is as wrong as one that changed too much." >&2
  grep -nE '^(OWNER|REPO|REF)=' "$test_guard" | sed 's/^/  /' >&2
  exit 1
fi
echo "ok: the three constants hold the intended values, and nothing else differs"
