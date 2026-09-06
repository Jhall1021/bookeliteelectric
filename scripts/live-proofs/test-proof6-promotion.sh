#!/bin/bash
#
# Offline acceptance cases for proof6-promotion.sh.
#
#   bash scripts/live-proofs/test-proof6-promotion.sh
#
# The stub holds THREE INDEPENDENT CLASSES — target, alias map, served identity —
# because every case worth testing is one where they disagree. A stub that
# derived served identity from the alias map could not express "the alias moved
# but the wire still serves the old sha", which is exactly the disagreement the
# release's per-host verification exists to catch.
set -uo pipefail
CAND=dpl_CAND; OUT=dpl_OUT; CSHA=24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d
OSHA=afa291520b5b8173c3d933d732f2bd67dbd7d0ac
H1=h1.vercel.app; H2=h2.vercel.app; H3=h3.vercel.app
pass=0; fail=0

setup() {
  T=$(mktemp -d "${TMPDIR:-/tmp}/p6t-XXXXXX"); mkdir -p "$T/bin" "$T/creds" "$T/evid"
  printf '%s' 'vcp_FAKEfakeFAKEfake0123456789' > "$T/creds/vercel-token"
  printf '%s' "$OUT" > "$T/target"
  printf '{"%s":"%s","%s":"%s","%s":"%s"}' "$H1" "$OUT" "$H2" "$CAND" "$H3" "$CAND" > "$T/aliases"
  printf '{"%s":"%s","%s":"%s","%s":"%s"}' "$H1" "$OSHA" "$H2" "$CSHA" "$H3" "$CSHA" > "$T/served"
  cat > "$T/bin/curl" <<'STUB'
#!/bin/sh
cfg=$(cat)
url=$(printf '%s' "$cfg" | sed -n 's/^url = "\(.*\)"$/\1/p' | head -1)
method=$(printf '%s' "$cfg" | sed -n 's/^request = "\(.*\)"$/\1/p' | head -1)
S="$STUB_DIR"
hdrfile=$(printf '%s' "$cfg" | sed -n 's/^dump-header = "\(.*\)"$/\1/p' | head -1)
[ -n "$hdrfile" ] && printf 'HTTP/2 200\r\n\r\n' > "$hdrfile"
case "$url" in
  */promote/*)
    dep=${url##*/promote/}
    n=$(cat "$S/promoten" 2>/dev/null || echo 0); n=$((n+1)); echo "$n" > "$S/promoten"
    if [ "$n" = "1" ]; then st="${STUB_PROMOTE_STATUS:-201}"; eff="${STUB_PROMOTE_EFFECT:-full}"
    else                   st="${STUB_RESTORE_STATUS:-201}"; eff="${STUB_RESTORE_EFFECT:-full}"; fi
    case "$eff" in
      full)        printf '%s' "$dep" > "$S/target"
                   python3 -c 'import json,sys;json.dump({k:sys.argv[2] for k in json.load(open(sys.argv[1]))},open(sys.argv[1],"w"))' "$S/aliases" "$dep"
                   python3 -c 'import json,sys;json.dump({k:sys.argv[2] for k in json.load(open(sys.argv[1]))},open(sys.argv[1],"w"))' "$S/served" "$STUB_SHA_FOR_DEP" ;;
      target-only) printf '%s' "$dep" > "$S/target" ;;
      one-alias)   python3 -c 'import json,sys
a=json.load(open(sys.argv[1])); k=sorted(a)[0]; a[k]=sys.argv[2]; json.dump(a,open(sys.argv[1],"w"))' "$S/aliases" "$dep" ;;
      alias-not-served) printf '%s' "$dep" > "$S/target"
                   python3 -c 'import json,sys;json.dump({k:sys.argv[2] for k in json.load(open(sys.argv[1]))},open(sys.argv[1],"w"))' "$S/aliases" "$dep" ;;
      protect-only) printf 'flip' > "$S/protectflip" ;;
      none)        : ;;
    esac
    printf '%s' "${STUB_PROMOTE_BODY:-}"; printf '\nHTTP_STATUS:%s' "$st"; exit 0 ;;
  */v9/projects/*)
    t=$(cat "$S/target")
    printf '{"targets":{"production":{"id":"%s","readyState":"READY"}}}' "$t"
    printf '\nHTTP_STATUS:200' ;;
  */v4/aliases*)
    if [ -n "${STUB_ALIAS_FAIL:-}" ]; then printf '{}'; printf '\nHTTP_STATUS:500'; exit 0; fi
    python3 -c '
import json,sys
a=json.load(open(sys.argv[1]))
print(json.dumps({"aliases":[{"alias":k,"deploymentId":v} for k,v in a.items()]}), end="")' "$S/aliases"
    printf '\nHTTP_STATUS:200' ;;
  */v13/deployments/*)
    printf '{"projectId":"prj_p","readyState":"READY","target":"production","gitSource":{"sha":"%s"},"projectSettings":{"outputDirectory":"public","buildCommand":"x provenance-guard.sh y"}}' "$STUB_CSHA"
    printf '\nHTTP_STATUS:200' ;;
  */events*)
    printf '[{"payload":{"text":"PROVENANCE OK %s"}},{"payload":{"text":"P2B-APP-BUILD-RAN"}}]' "$STUB_CSHA"
    printf '\nHTTP_STATUS:200' ;;
  */build-info.json)
    host=$(printf '%s' "$url" | sed 's|https://||; s|/build-info.json||')
    hdr=$(printf '%s' "$cfg" | sed -n 's/^dump-header = "\(.*\)"$/\1/p' | head -1)
    # A fresh nonce on every request, exactly like the real thing.
    nonce=$(head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n')
    protected=no; odd=no
    for ph in ${STUB_HOST_PROTECTED:-}; do [ "$ph" = "$host" ] && protected=yes; done
    if [ -n "${STUB_PROTECT_FOLLOWS:-}" ]; then
      t=$(cat "$S/target")
      mapped=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2],""))' "$S/aliases" "$host")
      if [ "$mapped" = "$t" ]; then protected=no; else protected=yes; fi
    fi
    [ "$host" = "${STUB_HOST_ODD_REDIRECT:-}" ] && odd=yes
    # Protection that appears only AFTER the promote call: routing untouched,
    # access state changed. The runner must call that a mutation.
    if [ -n "${STUB_PROTECT_ONCE:-}" ] && [ "$host" = "${STUB_PROTECT_ONCE}" ]; then
      pn=$(cat "$S/promoten" 2>/dev/null || echo 0)
      [ "$pn" != "0" ] && protected=yes
    fi
    if [ "$host" = "${STUB_HOST_FAIL:-}" ]; then
      [ -n "$hdr" ] && printf 'HTTP/2 503\r\n\r\n' > "$hdr"
      printf ''; printf '\nHTTP_STATUS:503'; exit 0
    fi
    if [ "$odd" = yes ]; then
      [ -n "$hdr" ] && printf 'HTTP/2 302\r\nlocation: https://example.invalid/somewhere\r\n\r\n' > "$hdr"
      printf 'Redirecting...'; printf '\nHTTP_STATUS:302'; exit 0
    fi
    if [ "$protected" = yes ]; then
      [ -n "$hdr" ] && printf 'HTTP/2 302\r\nlocation: https://vercel.com/sso-api?url=https%%3A%%2F%%2F%s%%2Fbuild-info.json&nonce=%s\r\n\r\n' "$host" "$nonce" > "$hdr"
      printf 'Redirecting...'; printf '\nHTTP_STATUS:302'; exit 0
    fi
    [ -n "$hdr" ] && printf 'HTTP/2 200\r\n\r\n' > "$hdr"
    python3 -c '
import json,sys
s=json.load(open(sys.argv[1]))
print(json.dumps({"commitSha":s.get(sys.argv[2]),"deploymentId":sys.argv[3]}), end="")' "$S/served" "$host" "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1])).get(sys.argv[2],""))' "$S/aliases" "$host")"
    printf '\nHTTP_STATUS:200' ;;
  *) printf '{}'; printf '\nHTTP_STATUS:200' ;;
esac
STUB
  chmod +x "$T/bin/curl"
}
teardown() { rm -rf "$T"; }

run() {  # run <name> <want-exit> <needle> [env...]
  name=$1; want=$2; needle=$3; shift 3
  setup
  out=$(env PATH="$T/bin:$PATH" P2B_LIVE_PROOFS_DIR="$T/creds" P2B_PROOF6_EVIDENCE="$T/evid" \
        STUB_DIR="$T" STUB_CSHA="$CSHA" STUB_SHA_FOR_DEP="$CSHA" \
        P2B_PROOF6_CANDIDATE="$CAND" P2B_PROOF6_OUTGOING="$OUT" P2B_PROOF6_CANDIDATE_SHA="$CSHA" \
        P2B_PROOF6_PROJECT="prj_p" P2B_PROOF6_HOSTS="$H1 $H2 $H3" \
        P2B_PROOF6_POLL=3 P2B_PROOF6_WAIT=0.05 "$@" \
        bash scripts/live-proofs/proof6-promotion.sh 2>&1)
  got=$?
  final_t=$(cat "$T/target")
  ok=yes
  [ "$got" = "$want" ] || ok=no
  printf '%s' "$out" | grep -q "$needle" || ok=no
  # The mandatory fact, in every case that got as far as promoting.
  if printf '%s' "$out" | grep -q "PROMOTION — one call" && [ "$final_t" != "$OUT" ] \
     && ! printf '%s' "$out" | grep -q RECOVERY_REQUIRED; then
    ok=no; extra=" [target left at $final_t]"
  else extra=""
  fi
  if [ "$ok" = yes ]; then printf "  ok    %-52s exit %s\n" "$name" "$got"; pass=$((pass+1))
  else printf "  FAIL  %-52s exit %s (wanted %s)%s\n" "$name" "$got" "$want" "$extra"
       printf '%s\n' "$out" | tail -5 | sed 's/^/          /'; fail=$((fail+1)); fi
  teardown
}

echo "proof6-promotion.sh — offline acceptance cases"
run "1  success: target and all aliases move"        0 "COMPLETE"
run "2  incomplete routing: target moves, alias does not" 0 "unchanged" STUB_PROMOTE_EFFECT=target-only
run "3  ambiguous, nothing applied"                  1 "nothing happened"      STUB_PROMOTE_STATUS=500 STUB_PROMOTE_EFFECT=none
run "4  ambiguous, fully applied"                    0 "the promotion applied" STUB_PROMOTE_STATUS=500 STUB_PROMOTE_EFFECT=full
run "5  ambiguous, target unchanged but ONE ALIAS moved" 1 "partial mutation"  STUB_PROMOTE_STATUS=500 STUB_PROMOTE_EFFECT=one-alias
run "6  target changed, one alias unchanged"         0 "unchanged"             STUB_PROMOTE_EFFECT=target-only
run "7  alias moved but served sha still old"        0 "not the candidate"     STUB_PROMOTE_EFFECT=alias-not-served
run "8  ambiguous restoration, resolved by reading"  0 "restored"              STUB_RESTORE_STATUS=500 STUB_RESTORE_EFFECT=full
run "9  restoration returns target, aliases differ"  0 "MANDATORY"             STUB_RESTORE_EFFECT=target-only
run "10 observation failure: a host unreadable"      1 "UNREADABLE HTTP 503"   STUB_HOST_FAIL="$H2"
run "11 restoration failure: target not restored"    2 "RECOVERY_REQUIRED"     STUB_RESTORE_EFFECT=none
run "12 an SSO redirect becomes PROTECTED"           0 "PROTECTED"             STUB_HOST_PROTECTED="$H2"
run "13 an UNEXPECTED redirect stays UNREADABLE"     1 "access state established" STUB_HOST_ODD_REDIRECT="$H2"
run "14 rotating nonces do not block stability"      0 "COMPLETE"              STUB_HOST_PROTECTED="$H2 $H3"
run "15 protection flips, target and aliases do not" 1 "partial mutation"      STUB_PROMOTE_STATUS=500 STUB_PROMOTE_EFFECT=none STUB_PROTECT_ONCE="$H2"
run "16 alias movement and protection inversion"     0 "access changed\|-> protected\|-> readable" STUB_PROTECT_FOLLOWS=1

echo
echo "  $pass passed, $fail failed."
[ "$fail" = "0" ]
