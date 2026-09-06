#!/bin/bash
#
# Offline tests for proof3-transaction.sh.
#
#   bash scripts/live-proofs/test-proof3-transaction.sh
#
# No network, no real credential. A stub `curl` on PATH holds the project's
# buildCommand in a state file and applies PATCHes to it, so the runner is
# driven through every branch against something that actually behaves like a
# mutable resource rather than a fixed transcript.
#
# The cases that matter are the ones where a write's outcome is UNKNOWN. Those
# are where a runner either restores correctly or leaves a project broken.
set -uo pipefail
ORIG='g=$(printf) && curl -fsSK- && npm run build'
TEMP="echo P2B-PROOF3-TEMP && $ORIG"
pass=0; fail=0

setup() {
  T=$(mktemp -d "${TMPDIR:-/tmp}/p3test-XXXXXX")
  mkdir -p "$T/bin" "$T/creds" "$T/evid"
  printf '%s' 'vcp_FAKEfakeFAKEfake0123456789' > "$T/creds/vercel-token"
  printf '%s' "$ORIG" > "$T/state"
  cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
cfg=$(cat)
url=$(printf '%s' "$cfg" | sed -n 's/^url = "\(.*\)"$/\1/p' | head -1)
method=$(printf '%s' "$cfg" | sed -n 's/^request = "\(.*\)"$/\1/p' | head -1)
data=$(printf '%s' "$cfg" | sed -n 's/^data = "@\(.*\)"$/\1/p' | head -1)
S="$STUB_STATE"
n=$(cat "$S.patchn" 2>/dev/null || echo 0)
if [ "$method" = "PATCH" ]; then
  n=$((n+1)); echo "$n" > "$S.patchn"
  if [ "$n" = "1" ]; then st="${STUB_W1:-200}"; applied="${STUB_W1_APPLIED:-auto}"
  else                   st="${STUB_W2:-200}"; applied="${STUB_W2_APPLIED:-auto}"; fi
  case "$applied" in
    auto) case "$st" in 2*) apply=yes ;; *) apply=no ;; esac ;;
    yes)  apply=yes ;;
    no)   apply=no ;;
  esac
  if [ "$apply" = "yes" ] && [ -n "$data" ]; then
    python3 -c 'import json,sys;sys.stdout.write(json.load(open(sys.argv[1]))["buildCommand"])' "$data" > "$S"
  fi
  printf '{"id":"prj_x"}'; printf '\nHTTP_STATUS:%s' "$st"; exit 0
fi
case "$url" in
  */v9/projects/*)
    if [ -n "${STUB_READ_FAIL:-}" ] && [ "$n" != "0" ]; then printf '{"error":{"message":"boom"}}'; printf '\nHTTP_STATUS:500'; exit 0; fi
    bc=$(cat "$S")
    python3 - "$bc" <<'PY'
import json,sys
print(json.dumps({"id":"prj_x","buildCommand":sys.argv[1],"rootDirectory":None,
  "installCommand":None,"outputDirectory":"public","framework":None,
  "targets":{"production":{"id":"dpl_target1","readyState":"READY"}}}), end="")
PY
    printf '\nHTTP_STATUS:200' ;;
  */v13/deployments/*)
    if [ -n "${STUB_DEPLOY_FOLLOWS:-}" ]; then dbc=$(cat "$S"); else dbc="${STUB_DEPLOY_BC:-frozen-command}"; fi
    ps=$(python3 - "$dbc" <<'PJ'
import json,sys
print(json.dumps({"rootDirectory":None,"installCommand":None,"buildCommand":sys.argv[1],
                  "outputDirectory":"public","framework":None}), end="")
PJ
)
    printf '{"id":"dpl_x","projectSettings":%s}' "$ps"; printf '\nHTTP_STATUS:200' ;;
  */v6/deployments*)
    if [ "$n" != "0" ]; then extra="${STUB_EXTRA_DEPLOY:-}"; else extra=""; fi
    printf '{"deployments":[{"uid":"dpl_x"}%s]}' "$extra"; printf '\nHTTP_STATUS:200' ;;
  */v4/aliases*)
    printf '{"aliases":[{"alias":"a.vercel.app","deploymentId":"%s"}]}' "${STUB_ALIAS:-dpl_x}"; printf '\nHTTP_STATUS:200' ;;
  *) printf '{}'; printf '\nHTTP_STATUS:200' ;;
esac
STUB
  chmod +x "$T/bin/curl"
}
teardown() { rm -rf "$T"; }

check() {  # check <name> <want-exit> <want-substring> [env...]
  name=$1; want=$2; needle=$3; shift 3
  setup
  out=$(env PATH="$T/bin:$PATH" P2B_LIVE_PROOFS_DIR="$T/creds" P2B_PROOF3_EVIDENCE="$T/evid" \
        STUB_STATE="$T/state" P2B_VERCEL_API="https://api.vercel.com" "$@" \
        bash scripts/live-proofs/proof3-transaction.sh 2>&1)
  got=$?
  final=$(cat "$T/state")
  if [ "$got" = "$want" ] && printf '%s' "$out" | grep -q "$needle"; then
    printf "  ok    %-46s exit %s\n" "$name" "$got"; pass=$((pass+1))
  else
    printf "  FAIL  %-46s exit %s (wanted %s)\n" "$name" "$got" "$want"
    printf '%s\n' "$out" | tail -6 | sed 's/^/          /'; fail=$((fail+1))
  fi
  # WHATEVER HAPPENED, the project must not be left holding the temporary value.
  if [ "$final" = "$TEMP" ] && ! printf '%s' "$out" | grep -q RECOVERY_REQUIRED; then
    printf "        !! LEFT THE TEMPORARY VALUE APPLIED WITHOUT SAYING SO\n"; fail=$((fail+1))
  fi
  teardown
}

echo "proof3-transaction.sh — offline cases"
check "success: full transaction"              0 "verdict PASSED"
check "definite refusal (403) changes nothing" 1 "definite refusal"            STUB_W1=403
check "ambiguous 500, NOT applied"             1 "did not apply"               STUB_W1=500 STUB_W1_APPLIED=no
check "ambiguous 500, APPLIED -> restore now"  1 "Restoring immediately"       STUB_W1=500 STUB_W1_APPLIED=yes
check "ambiguous 408 is not a 4xx refusal"     1 "did not apply"               STUB_W1=408 STUB_W1_APPLIED=no
check "ambiguous 429 is not a 4xx refusal"     1 "did not apply"               STUB_W1=429 STUB_W1_APPLIED=no
check "unreadable after ambiguous write"       2 "RECOVERY_REQUIRED"           STUB_W1=500 STUB_READ_FAIL=1
check "restoration refused -> RECOVERY"        2 "RECOVERY_REQUIRED"           STUB_W2=403
check "restoration writes a wrong value"       2 "RECOVERY_REQUIRED"           STUB_W2=200 STUB_W2_APPLIED=no
check "a new deployment appears"               1 "new deployment appeared"     STUB_EXTRA_DEPLOY=',{"uid":"dpl_new"}'
check "the historical record CHANGED"          1 "NOT HISTORICAL"              STUB_DEPLOY_FOLLOWS=1

# A catchable interruption must still restore. The runner is backgrounded, given
# time to apply write 1, then sent TERM.
setup
env PATH="$T/bin:$PATH" P2B_LIVE_PROOFS_DIR="$T/creds" P2B_PROOF3_EVIDENCE="$T/evid" \
    STUB_STATE="$T/state" STUB_SLOW=1 bash scripts/live-proofs/proof3-transaction.sh > "$T/out" 2>&1 &
pid=$!
i=0
while [ $i -lt 60 ]; do
  [ "$(cat "$T/state")" = "$TEMP" ] && break
  perl -e 'select(undef,undef,undef,0.05)'; i=$((i+1))
done
if [ "$(cat "$T/state")" = "$TEMP" ]; then
  kill -TERM "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  final=$(cat "$T/state")
  if [ "$final" = "$ORIG" ]; then
    printf "  ok    %-46s restored after SIGTERM\n" "catchable interruption"; pass=$((pass+1))
  else
    printf "  FAIL  %-46s left: %s\n" "catchable interruption" "${final:0:40}"; fail=$((fail+1))
  fi
else
  kill -TERM "$pid" 2>/dev/null; wait "$pid" 2>/dev/null
  printf "  FAIL  %-46s never observed the temporary value\n" "catchable interruption"; fail=$((fail+1))
fi
teardown

echo
echo "  $pass passed, $fail failed."
[ "$fail" = "0" ]
