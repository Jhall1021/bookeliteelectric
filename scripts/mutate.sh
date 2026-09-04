#!/bin/sh
# Mutation harness. Runs in a DISPOSABLE worktree, so a restore here can never
# discard implementation work — the last sweep's `git checkout -- scripts`
# destroyed an uncommitted fix, and that must not be possible again.
#
# Each mutation runs under a BOUNDED TIMEOUT that records failure. A hang is
# nontermination, which is a detected mutation, but "it hung" is not a result
# anyone can re-run: TIMEOUT is now a recorded outcome like any other.
TIMEOUT=${TIMEOUT:-60}
run_bounded() {
  npx tsx scripts/verify-release-control.ts > /tmp/mut.out 2>&1 &
  pid=$!
  waited=0
  while kill -0 "$pid" 2>/dev/null; do
    [ "$waited" -ge "$TIMEOUT" ] && { kill -9 "$pid" 2>/dev/null; echo "TIMEOUT(${TIMEOUT}s)"; return; }
    sleep 1; waited=$((waited + 1))
  done
  n=$(grep -oE '[0-9]+ failed' /tmp/mut.out | grep -oE '^[0-9]+')
  [ -z "$n" ] && { echo "CRASH"; return; }
  echo "$n"
}
mutate() {
  label="$1"; shift
  python3 -c "$1" >/dev/null 2>&1 || { printf "  %-46s SKIP (patch did not apply)\n" "$label"; git checkout -q -- scripts; return; }
  r=$(run_bounded)
  case "$r" in
    0) printf "  %-46s NOT DETECTED\n" "$label" ;;
    *) printf "  %-46s detected (%s)\n" "$label" "$r" ;;
  esac
  git checkout -q -- scripts
}
