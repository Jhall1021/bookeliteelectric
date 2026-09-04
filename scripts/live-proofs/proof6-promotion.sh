#!/bin/bash
#
# Proof 6 — does promotion move the hosts?
#
#   P2B_PROOF6_EVIDENCE=<dir> bash scripts/live-proofs/proof6-promotion.sh
#
# ONE PROMOTION of the candidate, ONE RESTORATION promotion of the outgoing
# deployment, through THE SAME ENDPOINT in both directions. Everything else is a
# read. No alias is ever assigned, removed or repaired.
#
# THE TARGET IS NOT A PROXY FOR ROUTING. Proof 4 case 1 moved two aliases while
# the target stayed put, so an ambiguous outcome is resolved by observing all
# three classes — target, every alias, every served identity — and "nothing
# happened" is permitted only when ALL of them match the preserved baseline.
# Anything unreadable is an unknown, and an unknown cannot establish absence.
#
# The trap restores after a definitely-applied promotion, including on INT, TERM
# and HUP. It CANNOT survive SIGKILL, machine failure or power loss; the
# outgoing id is preserved to a file first and printed on every failure path.
set -uo pipefail

API="${P2B_VERCEL_API:-https://api.vercel.com}"
PROJECT="${P2B_PROOF6_PROJECT:-prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q}"
CANDIDATE="${P2B_PROOF6_CANDIDATE:-dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS}"
OUTGOING="${P2B_PROOF6_OUTGOING:-dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf}"
CANDIDATE_SHA="${P2B_PROOF6_CANDIDATE_SHA:-24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d}"
EVID="${P2B_PROOF6_EVIDENCE:?set P2B_PROOF6_EVIDENCE}"
DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
HOSTS="${P2B_PROOF6_HOSTS:-p2b-release-proofs.vercel.app p2b-release-proofs-price2-book.vercel.app p2b-release-proofs-git-main-price2-book.vercel.app}"
POLL_MAX="${P2B_PROOF6_POLL:-10}"
POLL_WAIT="${P2B_PROOF6_WAIT:-15}"

mkdir -p "$EVID" || exit 1
phase=PRE          # PRE -> MAYBE_PROMOTED -> PROMOTED -> RESTORED
verdict=UNSET
say()  { printf '%s\n' "$*"; }
fail() { say "FAIL: $*"; verdict=FAILED; exit 1; }
recovery() {
  say ""; say "*** RECOVERY_REQUIRED ***"; say "  $*"
  say "  The outgoing production target must be restored by hand:"
  say "    POST $API/v10/projects/$PROJECT/promote/$(cat "$EVID/outgoing-id.txt" 2>/dev/null || echo "$OUTGOING")"
  verdict=RECOVERY_REQUIRED; exit 2
}

. "$(dirname "$0")/credential-shape.sh"
. "$(dirname "$0")/canonical-guard.sh"
tok=$(cat "$DIR/vercel-token" 2>/dev/null) || fail "no Vercel token"
credential_shape_check vercel "$tok" || exit 1

API_STATUS=""; API_BODY=""; CURL_RC=0
req() {   # req METHOD URL [authed=yes]
  local method="$1" url="$2" authed="${3:-yes}" out
  canonical_guard "$url" || exit 1
  out=$(mktemp "${TMPDIR:-/tmp}/p6-XXXXXX")
  {
    printf 'url = "%s"\n' "$url"
    [ "$authed" = "yes" ] && printf 'header = "Authorization: Bearer %s"\n' "$tok"
    printf 'request = "%s"\n' "$method"
    printf 'silent\nshow-error\nconnect-timeout = 15\nmax-time = 45\n'
    printf 'write-out = "\\nHTTP_STATUS:%%{http_code}"\n'
  } | curl --config - > "$out" 2>&1
  CURL_RC=$?
  API_STATUS=$(sed -n 's/.*HTTP_STATUS:\([0-9]*\)$/\1/p' "$out" | tail -1)
  API_BODY="$out.body"; sed 's/HTTP_STATUS:[0-9]*$//' "$out" > "$API_BODY"; rm -f "$out"
}

classify() {  # 408/429 before the generic 4xx rule
  local rc="$1" st="$2"
  if [ "$rc" != "0" ]; then echo ambiguous; return; fi
  case "$st" in
    2*) echo success ;; 408|429) echo ambiguous ;; 5*) echo ambiguous ;;
    4*) echo definite ;; *) echo ambiguous ;;
  esac
}

# One observation of all three classes, written as JSON.
observe_once() {   # observe_once <destfile>
  local dest="$1" tgt="" tstate="" tmpdir
  tmpdir=$(mktemp -d "${TMPDIR:-/tmp}/p6obs-XXXXXX")
  req GET "$API/v9/projects/$PROJECT"
  if [ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ]; then cp "$API_BODY" "$tmpdir/project.json"; fi
  req GET "$API/v4/aliases?projectId=$PROJECT&limit=50"
  if [ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ]; then cp "$API_BODY" "$tmpdir/aliases.json"; fi
  for h in $HOSTS; do
    req GET "https://$h/build-info.json" no
    if [ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ]; then cp "$API_BODY" "$tmpdir/served-$h.json"; fi
  done
  python3 - "$tmpdir" "$dest" "$HOSTS" <<'PY'
import json, os, sys
d, dest, hosts = sys.argv[1], sys.argv[2], sys.argv[3].split()
def load(n):
    p = os.path.join(d, n)
    if not os.path.exists(p): return None
    try: return json.load(open(p))
    except Exception: return None
proj = load("project.json")
target = None if proj is None else ((proj.get("targets") or {}).get("production") or {}).get("id")
target_state = None if proj is None else ((proj.get("targets") or {}).get("production") or {}).get("readyState")
al = load("aliases.json")
aliases = None if al is None else {a["alias"]: a.get("deploymentId") for a in al.get("aliases", []) if a.get("alias") in hosts}
served = {}
for h in hosts:
    s = load("served-%s.json" % h)
    served[h] = {"readable": False} if s is None else {
        "readable": True, "commitSha": s.get("commitSha"), "deploymentId": s.get("deploymentId")}
json.dump({"target": target, "targetState": target_state, "aliases": aliases, "served": served},
          open(dest, "w"), indent=2, sort_keys=True)
PY
  rm -rf "$tmpdir"
}

# Stable = two consecutive identical observations, within the bound.
observe_stable() {   # observe_stable <destfile> <label>
  local dest="$1" label="$2" i=0 a b
  a=$(mktemp); b=$(mktemp)
  observe_once "$a"
  while [ "$i" -lt "$POLL_MAX" ]; do
    perl -e "select(undef,undef,undef,${POLL_WAIT})" 2>/dev/null || sleep "$POLL_WAIT"
    observe_once "$b"
    if cmp -s "$a" "$b"; then cp "$b" "$dest"; rm -f "$a" "$b"; say "    $label: stable after $((i+1)) repeat(s)"; return 0; fi
    cp "$b" "$a"; i=$((i+1))
  done
  cp "$a" "$dest"; rm -f "$a" "$b"
  say "    $label: NOT STABLE within $POLL_MAX attempts — recorded as unestablished"
  return 1
}

restore() {
  say ""; say "RESTORING the outgoing production target $OUTGOING"
  req POST "$API/v10/projects/$PROJECT/promote/$OUTGOING"
  local k; k=$(classify "$CURL_RC" "$API_STATUS")
  say "  restoration: HTTP ${API_STATUS:-none} (curl $CURL_RC) -> $k"
  observe_stable "$EVID/observation-final.json" "final" || true
  local t; t=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("target"))' "$EVID/observation-final.json" 2>/dev/null)
  if [ "$t" = "$OUTGOING" ]; then
    say "  the production target is restored to $OUTGOING"
    phase=RESTORED; return 0
  fi
  recovery "the production target is '$t', not the outgoing deployment"
}

on_exit() {
  local rc=$?
  if [ "$phase" = "PROMOTED" ] || [ "$phase" = "MAYBE_PROMOTED" ]; then
    say ""; say "!! the promotion may still be in effect — restoring before exit"
    restore
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'say ""; say "interrupted"; exit 130' INT TERM HUP

say "PROOF 6 — does promotion move the hosts?"
say "  candidate $CANDIDATE   outgoing $OUTGOING"
say ""

say "1 revalidating the candidate by exact id"
req GET "$API/v13/deployments/$CANDIDATE"
[ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ] || fail "could not read the candidate"
cp "$API_BODY" "$EVID/candidate-record.json"
python3 - "$EVID/candidate-record.json" "$PROJECT" "$CANDIDATE_SHA" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ok=True
def chk(n,v):
    global ok
    print("    %s %s" % ("ok  " if v else "FAIL", n)); ok = ok and v
chk("projectId matches", d.get("projectId")==sys.argv[2])
chk("readyState READY", d.get("readyState")=="READY")
chk("target production", d.get("target")=="production")
chk("gitSource.sha is the pinned sha", (d.get("gitSource") or {}).get("sha")==sys.argv[3])
ps=d.get("projectSettings") or {}
chk("rootDirectory ABSENT, as proof 3 preserved", "rootDirectory" not in ps)
chk("outputDirectory public", ps.get("outputDirectory")=="public")
chk("buildCommand is the provenance one-liner", "provenance-guard.sh" in (ps.get("buildCommand") or ""))
raise SystemExit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail "the candidate did not revalidate"

req GET "$API/v3/deployments/$CANDIDATE/events?builds=1&limit=2000"
cp "$API_BODY" "$EVID/candidate-logs.json"
python3 - "$EVID/candidate-logs.json" "$CANDIDATE_SHA" <<'PY'
import json,sys
raw=open(sys.argv[1]).read(); rows=[]
try:
    j=json.loads(raw); rows = j if isinstance(j,list) else j.get("events",[])
except Exception:
    for ln in raw.splitlines():
        ln=ln.strip()
        if ln:
            try: rows.append(json.loads(ln))
            except Exception: pass
t=[((r.get("payload") or {}).get("text") or r.get("text") or "").rstrip() for r in rows]
t=[x for x in t if x]; blob="\n".join(t)
io=next((i for i,x in enumerate(t) if "PROVENANCE OK" in x), None)
ia=next((i for i,x in enumerate(t) if "P2B-APP-BUILD-RAN" in x), None)
ok = io is not None and ia is not None and ia > io and "PROVENANCE REFUSED" not in blob and ("PROVENANCE OK %s" % sys.argv[2]) in blob
print("    %s guard approved the pinned sha, application build strictly after" % ("ok  " if ok else "FAIL"))
raise SystemExit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail "the candidate's ordered build evidence did not revalidate"

say ""
say "2 baseline — a complete, stable observation is REQUIRED before any write"
observe_stable "$EVID/observation-baseline.json" "baseline" || fail "the baseline never stabilised; nothing was written"
printf '%s' "$OUTGOING" > "$EVID/outgoing-id.txt"
python3 - "$EVID/observation-baseline.json" "$OUTGOING" <<'PY'
import json,sys
o=json.load(open(sys.argv[1])); ok=True
def chk(n,v):
    global ok
    print("    %s %s" % ("ok  " if v else "FAIL", n)); ok = ok and v
chk("production target is the outgoing deployment", o.get("target")==sys.argv[2])
chk("target is READY", o.get("targetState")=="READY")
chk("every alias mapping readable", isinstance(o.get("aliases"),dict) and len(o["aliases"])==3
    and all(v for v in o["aliases"].values()))
chk("every host's build-info readable", all(v.get("readable") for v in o["served"].values()))
print()
print("    baseline routing")
for h,d in sorted((o.get("aliases") or {}).items()): print("      %-52s -> %s" % (h,d))
print("    served identities (fields as ACTUALLY exposed)")
for h,v in sorted(o["served"].items()):
    print("      %-52s %s" % (h, v))
raise SystemExit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail "the baseline is incomplete; stopping before promotion"

say ""
say "3 PROMOTION — one call, candidate $CANDIDATE"
phase=MAYBE_PROMOTED
req POST "$API/v10/projects/$PROJECT/promote/$CANDIDATE"
k=$(classify "$CURL_RC" "$API_STATUS")
say "    HTTP ${API_STATUS:-none} (curl $CURL_RC) -> $k"
cp "$API_BODY" "$EVID/promote-response.json"
python3 -c '
import os,sys
p=sys.argv[1]; n=os.path.getsize(p)
print("    response body: %d bytes%s" % (n, "" if n else " — EMPTY, so identity cannot come from it"))' "$EVID/promote-response.json"

case "$k" in
  definite)
    phase=PRE
    say "    a definite refusal: nothing was promoted"
    verdict=REFUSED; exit 1 ;;
  ambiguous)
    say "    ambiguous — resolving by COMPLETE stable observation, not the target alone"
    observe_stable "$EVID/observation-ambiguous.json" "resolution" || recovery "an ambiguous promotion could not be resolved: no stable observation"
    python3 - "$EVID/observation-baseline.json" "$EVID/observation-ambiguous.json" "$CANDIDATE" <<'PY'
import json,sys
b=json.load(open(sys.argv[1])); a=json.load(open(sys.argv[2])); cand=sys.argv[3]
unreadable = (a.get("target") is None or a.get("aliases") is None
              or not all(v.get("readable") for v in a["served"].values()))
same_target = a.get("target")==b.get("target")
same_alias  = a.get("aliases")==b.get("aliases")
same_served = a.get("served")==b.get("served")
print("    target same: %s   aliases same: %s   served same: %s   unreadable: %s"
      % (same_target, same_alias, same_served, unreadable))
if a.get("target")==cand: raise SystemExit(10)          # promoted
if unreadable:            raise SystemExit(12)          # cannot establish
if same_target and same_alias and same_served: raise SystemExit(11)   # nothing happened
raise SystemExit(13)                                    # partial mutation
PY
    case $? in
      10) say "    the target is the candidate: the promotion applied"; phase=PROMOTED ;;
      11) phase=PRE; say "    all three classes match the baseline: nothing happened"; verdict=NOT_APPLIED; exit 1 ;;
      12) recovery "an ambiguous promotion left a class unreadable; absence cannot be established" ;;
      13) say "    TARGET UNCHANGED BUT ROUTING DID CHANGE — treating as a partial mutation"
          phase=PROMOTED
          restore
          verdict=AMBIGUOUS_PARTIAL_RESTORED; exit 1 ;;
    esac ;;
  success) phase=PROMOTED ;;
esac

say ""
say "4 observing after promotion"
observe_stable "$EVID/observation-promoted.json" "post-promotion" || say "    (unstable — classified as unestablished below)"

say ""
say "5 classification — three classes, kept apart"
python3 - "$EVID/observation-baseline.json" "$EVID/observation-promoted.json" "$CANDIDATE" "$OUTGOING" "$CANDIDATE_SHA" <<'PY'
import json,sys
b=json.load(open(sys.argv[1])); p=json.load(open(sys.argv[2]))
cand,out,csha=sys.argv[3],sys.argv[4],sys.argv[5]
print("  TARGET")
t=p.get("target")
print("    %s -> %s   %s" % (b.get("target"), t,
      "CHANGED to the candidate" if t==cand else "unchanged" if t==b.get("target") else "changed to something else" if t else "UNREADABLE"))
print("  ALIASES, host by host")
for h in sorted(b.get("aliases") or {}):
    was=(b.get("aliases") or {}).get(h); now=(p.get("aliases") or {}).get(h)
    verdict = "UNREADABLE" if now is None else ("moved to the candidate" if now==cand else "unchanged" if now==was else "moved to %s" % now)
    print("    %-52s %s" % (h, verdict))
print("  SERVED IDENTITY, host by host")
for h in sorted(b.get("served") or {}):
    v=(p.get("served") or {}).get(h) or {}
    if not v.get("readable"): print("    %-52s UNREADABLE" % h); continue
    sha=v.get("commitSha")
    print("    %-52s sha %s  %s" % (h, (sha or "none")[:12],
          "the candidate's" if sha==csha else "not the candidate's"))
PY

say ""
say "6 preserving the complete post-promotion state before restoration"
cp "$EVID/observation-promoted.json" "$EVID/observation-promoted-preserved.json"
say "    preserved"

restore
say ""
say "7 final state"
python3 - "$EVID/observation-baseline.json" "$EVID/observation-final.json" "$OUTGOING" <<'PY'
import json,sys
b=json.load(open(sys.argv[1])); f=json.load(open(sys.argv[2])); out=sys.argv[3]
print("  MANDATORY: production target restored -> %s" % ("YES" if f.get("target")==out else "NO"))
print("  aliases (differences are accepted within the disposable boundary)")
for h in sorted(b.get("aliases") or {}):
    was=(b.get("aliases") or {}).get(h); now=(f.get("aliases") or {}).get(h)
    print("    %-52s %s" % (h, "as before" if now==was else "%s -> %s" % (was, now)))
raise SystemExit(0 if f.get("target")==out else 1)
PY
[ $? -eq 0 ] || recovery "the final target is not the outgoing deployment"
verdict=COMPLETE
say ""
say "PROOF 6 COMPLETE — verdict $verdict"
