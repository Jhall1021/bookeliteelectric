#!/bin/bash
#
# Build the TEST guard from the reviewed one, and record what makes them differ.
#
#   bash scripts/live-proofs/make-test-guard.sh <owner> <repo> <ref> <out-dir>
#   bash scripts/live-proofs/make-test-guard.sh --verify <out-dir>
#
# The reviewed guard hard-codes OWNER/REPO/REF and compares them against
# VERCEL_GIT_REPO_OWNER / _SLUG / _COMMIT_REF, so on a disposable repository an
# unmodified guard refuses WRONG_OWNER before reaching anything the proofs are
# about. The tested artifact is a modified copy BY CONSTRUCTION, and that is
# only acceptable while the modification is exactly the three constants.
#
# AN ERROR IS NOT AN AGREEMENT. This script previously reported success with the
# reviewed source deleted: diff failed, printed nothing to stdout, grep matched
# nothing, and "zero unexpected differences" was read as "nothing differs". Every
# comparison, read and hash below is therefore status-checked, and the reviewed
# source is required and pinned in BOTH modes.
set -uo pipefail

REVIEWED="scripts/provenance-guard.sh"
EXPECTED_REVIEWED="2e6e4b289b57a49579cef88ee1f7bfffc5786bf8"

refuse() { echo "REFUSING: $*" >&2; exit 1; }

hash_of() {                       # hash, or refuse — never an empty string
  local h
  h=$(git hash-object "$1" 2>/dev/null) || refuse "could not hash $1"
  [ -n "$h" ] || refuse "empty hash for $1"
  printf '%s' "$h"
}

# The reviewed artifact must EXIST and BE the one the review covered, in both
# modes. Comparing against whatever happens to be on disk proves only that
# copying worked; comparing against nothing at all proves less than that.
require_reviewed() {
  [ -e "$REVIEWED" ] || refuse "$REVIEWED does not exist — there is nothing to compare against"
  [ -f "$REVIEWED" ] || refuse "$REVIEWED is not a regular file"
  [ -r "$REVIEWED" ] || refuse "$REVIEWED is not readable"
  local actual; actual=$(hash_of "$REVIEWED")
  [ "$actual" = "$EXPECTED_REVIEWED" ] || refuse \
"$REVIEWED is not the reviewed artifact.
  expected $EXPECTED_REVIEWED
  found    $actual
Every proof is reported against the reviewed guard's behaviour; this is not it."
}

# diff exits 0 (same), 1 (differs), >1 (trouble). Only the first two are answers.
unexpected_lines() {
  local out st
  out=$(diff "$REVIEWED" "$1" 2>&1); st=$?
  [ "$st" -le 1 ] || refuse "comparison failed (diff status $st): $out"
  printf '%s\n' "$out" | grep '^[<>]' | grep -vcE '^[<>] (OWNER|REPO|REF)=' || true
}

# ---------------------------------------------------------------- verify mode
if [ "${1:-}" = "--verify" ]; then
  out="${2:-}"
  [ -n "$out" ] || { echo "usage: bash $0 --verify <out-dir>" >&2; exit 2; }
  require_reviewed

  tg="$out/provenance-guard.test.sh"; rec="$out/guard-identity.txt"
  [ -f "$tg" ]  || refuse "no test artifact at $tg"
  [ -f "$rec" ] || refuse "no identity record at $rec"

  was=$(sed -n 's/^  test blob  *//p' "$rec")
  [ -n "$was" ] || refuse "the identity record carries no test blob hash"
  now=$(hash_of "$tg")
  echo "recorded test blob  $was"
  echo "artifact now        $now"
  [ "$now" = "$was" ] || refuse "the artifact changed after it was recorded"

  bad=$(unexpected_lines "$tg")
  [ "$bad" -eq 0 ] || refuse "$bad line(s) differ from the reviewed guard beyond the constants"
  echo "ok: reviewed source pinned, artifact unchanged since recording, only the constants differ"
  exit 0
fi

# ------------------------------------------------------------ generation mode
owner="${1:-}"; repo="${2:-}"; ref="${3:-}"; out="${4:-}"
[ -n "$owner" ] && [ -n "$repo" ] && [ -n "$ref" ] && [ -n "$out" ] || {
  echo "usage: bash $0 <owner> <repo> <ref> <out-dir>" >&2
  echo "       bash $0 --verify <out-dir>" >&2; exit 2; }

require_reviewed
mkdir -p "$out" || refuse "could not create $out"
test_guard="$out/provenance-guard.test.sh"

sed -e "s|^OWNER=.*$|OWNER=$owner|" \
    -e "s|^REPO=.*$|REPO=$repo|" \
    -e "s|^REF=.*$|REF=$ref|" \
    "$REVIEWED" > "$test_guard" || refuse "could not write $test_guard"

reviewed_hash=$(hash_of "$REVIEWED")
test_hash=$(hash_of "$test_guard")

# Two halves. Counting differing lines was the obvious rule and it was wrong: a
# substitution can be a no-op (REF=main -> main changes nothing) and a correct
# run would have been refused for it. So nothing outside the three constants may
# differ, AND each constant must actually hold its intended value.
bad=$(unexpected_lines "$test_guard")

wrong=""
grep -qx "OWNER=$owner" "$test_guard" || wrong="$wrong OWNER"
grep -qx "REPO=$repo"   "$test_guard" || wrong="$wrong REPO"
grep -qx "REF=$ref"     "$test_guard" || wrong="$wrong REF"

diff_out=$(diff "$REVIEWED" "$test_guard" 2>&1); ds=$?
[ "$ds" -le 1 ] || refuse "comparison failed (diff status $ds): $diff_out"

record="$out/guard-identity.txt"
{
  echo "GUARD IDENTITY — recorded before any build"
  echo "  recorded at        $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "  reviewed artifact  $REVIEWED"
  echo "  reviewed blob      $reviewed_hash"
  echo "  test blob          $test_hash"
  echo "  substitutions      OWNER=$owner REPO=$repo REF=$ref"
  echo "  lines differing    $(printf '%s\n' "$diff_out" | grep -c '^[<>]') (a no-op substitution legitimately differs by none)"
  echo
  echo "DIFF (reviewed -> test)"
  printf '%s\n' "$diff_out" | sed 's/^/  /'
} > "$record" || refuse "could not write $record"

echo "reviewed blob  $reviewed_hash"
echo "test blob      $test_hash"
echo "record         $record"

[ "$bad" -eq 0 ] || refuse "$bad line(s) differ beyond the three constants — the tested artifact would not be the reviewed guard's behaviour"
[ -z "$wrong" ] || refuse "these constants do not hold the intended value:$wrong"
echo "ok: the three constants hold the intended values, and nothing else differs"
