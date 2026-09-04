#!/bin/bash
#
# Mutation sweep for the controlled release — self-contained.
#
#   bash scripts/mutation-sweep.sh [commit-ish]     # default: HEAD
#
# Breaks each guard on purpose and checks the suite notices. A guard no
# mutation can break is a guard that is not doing anything, and this is the only
# way to find out which those are — twice already it has caught a check that
# passed for a reason unrelated to what it claimed to test.
#
# THREE THINGS THE EARLIER HELPER GOT WRONG, all fixed here:
#
#   1. The timeout killed the wrapper, not the work. `kill -9 $pid` ended the
#      shell that had run `npx`, while the node process it spawned carried on —
#      so TIMEOUT was printed while the worker was still running, and stray
#      processes had to be cleaned up by hand. Each run now gets its OWN PROCESS
#      GROUP, the group is signalled, and the runner WAITS for it to die.
#   2. Disposability was documented rather than enforced. The script restores
#      with `git checkout -- scripts`; doing that in a working tree once
#      discarded an uncommitted fix. It now CREATES its own worktree and refuses
#      to run anywhere else.
#   3. The mutations lived in the operator's shell history, so the results could
#      not be reproduced from what was shipped. All eight are below.

set -uo pipefail

TARGET="${1:-HEAD}"
TIMEOUT="${TIMEOUT:-90}"
SUITE="scripts/verify-release-control.ts"

repo_root=$(git rev-parse --show-toplevel) || { echo "not a git repository" >&2; exit 1; }
sha=$(git rev-parse --verify "$TARGET") || exit 1
modules="$repo_root/node_modules"

work=$(mktemp -d "${TMPDIR:-/tmp}/p2b-mutation-XXXXXX") || exit 1
tree="$work/tree"

cleanup() {
  cd "$repo_root" 2>/dev/null || true
  git worktree remove "$tree" --force >/dev/null 2>&1
  rm -rf "$work"
}
trap cleanup EXIT INT TERM

git worktree add --detach "$tree" "$sha" >/dev/null 2>&1 || { echo "could not create worktree" >&2; exit 1; }
# Resolve symlinks on both sides: mktemp hands back /tmp/... while git reports
# /private/var/folders/... on macOS, and comparing the two unresolved would
# refuse a perfectly good worktree — or, worse, accept a bad one.
tree=$(cd "$tree" && pwd -P)
repo_root=$(cd "$repo_root" && pwd -P)
[ -e "$tree/node_modules" ] || ln -s "$modules" "$tree/node_modules"

cd "$tree" || exit 1

# ISOLATION IS CHECKED, NOT ASSUMED. Everything below runs `git checkout --
# scripts`, so being somewhere disposable is a precondition, not a comment.
here=$(git rev-parse --show-toplevel)
case "$here" in
  "$repo_root") echo "REFUSING: this is the main working tree, where a restore would destroy work" >&2; exit 1 ;;
  "$tree") ;;
  *) echo "REFUSING: unexpected worktree $here" >&2; exit 1 ;;
esac
if ! git status --porcelain | grep -q .; then :; else
  echo "REFUSING: the disposable worktree is not clean" >&2; exit 1
fi

# --- bounded run, whole process tree ---------------------------------------
run_suite() {
  set -m                                  # job control: the child leads its own group
  npx tsx "$SUITE" > "$work/out" 2>&1 &
  local pid=$! waited=0
  set +m
  while kill -0 "$pid" 2>/dev/null; do
    if [ "$waited" -ge "$TIMEOUT" ]; then
      kill -TERM "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      sleep 2
      kill -KILL "-$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null
      wait "$pid" 2>/dev/null            # reap, and do not return before it is gone
      # Lowercase token, not a display string: every caller cases on it, and a
      # timeout that fell through to the catch-all was reported as a missing
      # summary — the right refusal for the wrong reason.
      echo "timeout"
      return
    fi
    sleep 1; waited=$((waited + 1))
  done
  wait "$pid" 2>/dev/null
  # The suite prints "  N passed, M failed." as its LAST act. No summary means it
  # never got there — a crash, a missing launcher, an import error. That is a
  # broken harness, and the old code returned it as "CRASH" into a comparison
  # against 0, which made an empty run look like a run.
  local n
  n=$(grep -oE '[0-9]+ failed\.' "$work/out" | grep -oE '^[0-9]+' | tail -1)
  [ -z "$n" ] && { echo "nosummary"; return; }
  echo "ok:$n"
}

survivors=0
harness_failures=0
mutate() {
  local label="$1" name="$2"
  if ! python3 scripts/_mutations.py --apply "$name" >/dev/null 2>&1; then
    # Drift, not evidence. The guard was never tested, so it is neither load-
    # bearing nor proven dead — it counts against the sweep either way.
    printf "  %-46s SKIP (patch did not apply)\n" "$label"
    harness_failures=$((harness_failures + 1)); git checkout -q -- scripts; return
  fi
  local r; r=$(run_suite)
  case "$r" in
    ok:0)
      printf "  %-46s NOT DETECTED\n" "$label"
      survivors=$((survivors + 1)) ;;
    ok:*)
      printf "  %-46s detected (%s failing)\n" "$label" "${r#ok:}" ;;
    timeout)
      # A mutation that hangs the suite is not a mutation the suite caught.
      printf "  %-46s HARNESS FAILURE (timeout)\n" "$label"
      harness_failures=$((harness_failures + 1)) ;;
    *)
      printf "  %-46s HARNESS FAILURE (no test summary)\n" "$label"
      harness_failures=$((harness_failures + 1)) ;;
  esac
  git checkout -q -- scripts
  # Nothing of ours may outlive its own run.
  local stray; stray=$(pgrep -f "verify-release-control" 2>/dev/null | wc -l | tr -d ' ')
  [ "$stray" != "0" ] && printf "  %-46s WARNING: %s stray process(es)\n" "" "$stray"
}


MUTATIONS=$(python3 scripts/_mutations.py --list) || { echo "cannot list mutations" >&2; exit 1; }

echo
echo "MUTATION SWEEP — $(git rev-parse --short HEAD)"
echo "  worktree $tree (disposable, removed on exit)"
echo "  timeout  ${TIMEOUT}s per mutation, process group signalled and reaped"
echo

# THE ENTRY BASELINE. Every result below is a comparison against this run; if it
# does not pass, the sweep has nothing to compare to and reports nothing.
printf "  %-46s " "baseline (before sweep)"
first=$(run_suite)
case "$first" in
  ok:0) grep -E "passed," "$work/out" | tail -1 | sed 's/^ *//' ;;
  ok:*) echo "FAILED (${first#ok:} failing)"
        echo >&2; echo "REFUSING: the unmutated suite does not pass — a sweep from here proves nothing" >&2; exit 1 ;;
  timeout) echo "TIMEOUT(${TIMEOUT}s)"
        echo >&2; echo "REFUSING: the unmutated suite did not finish" >&2; exit 1 ;;
  *) echo "NO TEST SUMMARY"
        echo >&2; echo "REFUSING: the unmutated suite produced no test summary — the harness is broken, not the code" >&2; exit 1 ;;
esac
echo

while IFS= read -r name; do
  [ -z "$name" ] && continue
  label=$(python3 scripts/_mutations.py --label "$name")
  mutate "$label" "$name"
done <<< "$MUTATIONS"

echo
if [ "$survivors" -eq 0 ] && [ "$harness_failures" -eq 0 ]; then
  echo "  every mutation was detected."
elif [ "$survivors" -eq 0 ]; then
  echo "  no mutation survived, but the sweep is incomplete — see below."
else
  echo "  $survivors mutation(s) NOT DETECTED — those guards are not load-bearing."
fi
[ "$harness_failures" -gt 0 ] && echo "  $harness_failures run(s) produced no test summary — the harness failed, not the code."

# THE FINAL BASELINE. The tree is restored between mutations, so this proves the
# restores worked and the suite still passes — a sweep that corrupted its own
# worktree would otherwise finish looking clean.
echo
printf "  %-46s " "baseline (after restores)"
last=$(run_suite)
final_bad=0
case "$last" in
  ok:0) grep -E "passed," "$work/out" | tail -1 | sed 's/^ *//' ;;
  ok:*) echo "FAILED (${last#ok:} failing)"; final_bad=1 ;;
  timeout) echo "TIMEOUT(${TIMEOUT}s)"; final_bad=1 ;;
  *) echo "NO TEST SUMMARY"; final_bad=1 ;;
esac
echo

exit $((survivors + harness_failures + final_bad))
