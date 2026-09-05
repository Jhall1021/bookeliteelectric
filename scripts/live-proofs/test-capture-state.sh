#!/bin/sh
#
# Offline tests for capture-state.sh's production-target validation.
#
#   sh scripts/live-proofs/test-capture-state.sh
#
# No network and no real credentials: a stub `curl` on PATH serves canned
# responses, and the token files hold obvious fakes of the right SHAPE so the
# credential checks pass without a secret existing.
#
# The point is the refusals. A validator that has only ever seen a good response
# is not a validator, so every rejection path is driven here.
set -u
T=$(mktemp -d "${TMPDIR:-/tmp}/capstate-XXXXXX") || exit 1
trap 'rm -rf "$T"' EXIT
mkdir -p "$T/bin" "$T/creds"
printf '%s' 'github_pat_11FAKEfakeFAKEfakeFAKEfake' > "$T/creds/github-token"
printf '%s' 'vcp_FAKEfakeFAKEfake0123456789'        > "$T/creds/vercel-token"
chmod 600 "$T/creds"/*

cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
cfg=$(cat)
url=$(printf '%s' "$cfg" | sed -n 's/^url = "\(.*\)"$/\1/p' | head -1)
case "$url" in
  */git/ref/heads/main) echo '{"object":{"sha":"24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d","type":"commit"}}' ;;
  */commits/*)          echo '{"commit":{"message":"stub","committer":{"date":"2026-09-04T00:00:00Z"},"verification":{"reason":"valid"}},"parents":[]}' ;;
  */git/trees/*)        echo '{"truncated":false,"tree":[{"path":"scripts/provenance-guard.sh","type":"blob","sha":"9d9139d2913aa2deb22db5bb86b56a96bc5f9f1a"}]}' ;;
  */v9/projects/*)      printf '%s' "$STUB_PROJECT" ;;
  */v6/deployments*)    echo '{"deployments":[]}' ;;
  */v4/aliases*)        echo '{"aliases":[],"pagination":{"next":null}}' ;;
  *)                    echo '{}' ;;
esac
STUB
chmod +x "$T/bin/curl"

pass=0; fail=0
run() {  # run <name> <expect-exit> <expect-substring> <project-json>
  name=$1; want=$2; needle=$3; json=$4
  out=$(env PATH="$T/bin:$PATH" P2B_LIVE_PROOFS_DIR="$T/creds" STUB_PROJECT="$json" \
        sh scripts/live-proofs/capture-state.sh "test" 2>&1)
  got=$?
  if [ "$got" = "$want" ] && printf '%s' "$out" | grep -q "$needle"; then
    echo "  ok    $name"; pass=$((pass+1))
  else
    echo "  FAIL  $name (exit $got, wanted $want)"
    printf '%s\n' "$out" | sed 's/^/          /' | tail -4; fail=$((fail+1))
  fi
}

echo "capture-state.sh — production target validation"
run "a well-formed target is recorded" 0 "dpl_STUBtarget123" \
  '{"targets":{"production":{"id":"dpl_STUBtarget123","readyState":"READY"}}}'
run "targets absent refuses" 1 "carries no targets field" \
  '{"name":"p"}'
run "targets not an object refuses" 1 "targets is not an object" \
  '{"targets":"production"}'
run "no production entry refuses" 1 "no production entry" \
  '{"targets":{"preview":{"id":"dpl_x1"}}}'
run "null production refuses" 1 "targets.production is null" \
  '{"targets":{"production":null}}'
run "production not an object refuses" 1 "not an object" \
  '{"targets":{"production":"dpl_x1"}}'
run "no id refuses" 1 "carries no deployment id" \
  '{"targets":{"production":{"readyState":"READY"}}}'
run "two disagreeing ids refuse as AMBIGUOUS" 1 "AMBIGUOUS" \
  '{"targets":{"production":{"id":"dpl_aaa1","deploymentId":"dpl_bbb2"}}}'
run "two AGREEING ids are accepted" 0 "dpl_same1" \
  '{"targets":{"production":{"id":"dpl_same1","deploymentId":"dpl_same1","readyState":"READY"}}}'
run "a non-deployment id refuses as MALFORMED" 1 "not a deployment id" \
  '{"targets":{"production":{"id":"prj_notadeployment"}}}'
run "a numeric id refuses as MALFORMED" 1 "not a deployment id" \
  '{"targets":{"production":{"id":42}}}'
run "an error response refuses as UNREADABLE" 1 "response is an error" \
  '{"error":{"code":"forbidden","message":"Not authorized"}}'
run "non-JSON refuses as UNREADABLE" 1 "not JSON" \
  'this is not json at all'

echo
echo "  $pass passed, $fail failed."
[ "$fail" = "0" ]
