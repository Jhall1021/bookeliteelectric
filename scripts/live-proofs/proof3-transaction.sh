#!/bin/bash
#
# Proof 3 — are a completed deployment's settings historical, or do they follow
# the project's current configuration?
#
#   P2B_PROOF3_EVIDENCE=<dir> bash scripts/live-proofs/proof3-transaction.sh
#
# TWO WRITES, BOTH TO ONE FIELD OF ONE DISPOSABLE PROJECT, the second returning
# it to where it started. Everything else is a read.
#
# RESTORATION IS PART OF THE TRANSACTION. Once the temporary value is definitely
# applied, the original is written back even if an observation fails, an
# assertion fails, or the run is interrupted (INT, TERM, HUP, or a normal exit
# down any path). It CANNOT survive SIGKILL, machine failure or power loss —
# nothing in a shell can — so the exact original is preserved to a file first and
# printed on every failure path, and manual recovery is always possible.
#
# The original is never retyped and never reconstructed: it is captured from the
# API, round-tripped, and restored from that file.
set -uo pipefail

API="${P2B_VERCEL_API:-https://api.vercel.com}"
PROJECT="${P2B_PROOF3_PROJECT:-prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q}"
DEPLOY="${P2B_PROOF3_DEPLOYMENT:-dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS}"
EVID="${P2B_PROOF3_EVIDENCE:?set P2B_PROOF3_EVIDENCE to an evidence directory}"
DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
PREFIX="echo P2B-PROOF3-TEMP && "
MAXLEN=256

mkdir -p "$EVID" || exit 1
ORIG_FILE="$EVID/original-buildCommand.json"     # the value, JSON-encoded
W1_BODY="$EVID/write1-body.json"
W2_BODY="$EVID/write2-body.json"

# PRE -> MAYBE_APPLIED -> APPLIED -> RESTORED
#
# MAYBE_APPLIED IS SET BEFORE THE WRITE IS SENT, not after it returns. The
# server applies the change before the client learns of it, so a signal landing
# in that window would otherwise find phase=PRE and skip restoration — which an
# interruption test caught it doing. Intent is recorded before the mutation, the
# same way the release's own journal does it, and restoring a value that was
# never changed is harmless.
phase=PRE
verdict=UNSET
say()    { printf '%s\n' "$*"; }
fail()   { say "FAIL: $*"; verdict=FAILED; exit 1; }
recovery() {
  say ""
  say "*** RECOVERY_REQUIRED ***"
  say "  $*"
  say "  The project's buildCommand must be restored by hand to the value in:"
  say "    $ORIG_FILE"
  say "  No further experiment will run."
  verdict=RECOVERY_REQUIRED
  exit 2
}

. "$(dirname "$0")/credential-shape.sh"
. "$(dirname "$0")/canonical-guard.sh"
tok=$(cat "$DIR/vercel-token" 2>/dev/null) || fail "no Vercel token"
credential_shape_check vercel "$tok" || exit 1

API_STATUS=""; API_BODY=""; CURL_RC=0
api() {   # api METHOD URL [json-body-file]
  local method="$1" url="$2" data="${3:-}" out
  canonical_guard "$url" || exit 1
  out=$(mktemp "${TMPDIR:-/tmp}/p3api-XXXXXX")
  {
    printf 'url = "%s"\n' "$url"
    printf 'header = "Authorization: Bearer %s"\n' "$tok"
    printf 'request = "%s"\n' "$method"
    if [ -n "$data" ]; then
      printf 'header = "Content-Type: application/json"\n'
      printf 'data = "@%s"\n' "$data"
    fi
    printf 'silent\nshow-error\nconnect-timeout = 15\nmax-time = 60\n'
    printf 'write-out = "\\nHTTP_STATUS:%%{http_code}"\n'
  } | curl --config - > "$out" 2>&1
  CURL_RC=$?
  API_STATUS=$(sed -n 's/.*HTTP_STATUS:\([0-9]*\)$/\1/p' "$out" | tail -1)
  API_BODY="$out.body"
  sed 's/HTTP_STATUS:[0-9]*$//' "$out" > "$API_BODY"
  rm -f "$out"
}

# 408 and 429 are checked BEFORE the generic 4xx rule: they are a timeout and a
# rate limit, and neither says the write did not happen.
classify() {
  local rc="$1" st="$2"
  if [ "$rc" != "0" ]; then echo ambiguous; return; fi
  case "$st" in
    2*)      echo success ;;
    408|429) echo ambiguous ;;
    5*)      echo ambiguous ;;
    4*)      echo definite ;;
    *)       echo ambiguous ;;
  esac
}

# FETCH TO A FILE, THEN READ THE FILE. The earlier version returned the value on
# stdout, so every caller invoked it as $(…) — a subshell, which kept API_BODY to
# itself. The parent then copied whatever the PREVIOUS call had left there, and
# the evidence for "the project during the change" was actually the PATCH
# response. The comparison that caught it was reading two settings maps, one of
# which was not a project at all.
fetch_project() {   # fetch_project <dest-file>; 0 on a readable 200
  api GET "$API/v9/projects/$PROJECT"
  [ "$CURL_RC" = "0" ] || return 1
  [ "$API_STATUS" = "200" ] || return 1
  cp "$API_BODY" "$1" || return 1
}

project_buildcommand() {   # project_buildcommand <saved-file> -> stdout
  python3 -c '
import json,sys
d=json.load(open(sys.argv[1]))
v=d.get("buildCommand")
if not isinstance(v,str): sys.exit(1)
sys.stdout.write(v)' "$1"
}

restore() {
  say ""
  say "RESTORING the original buildCommand"
  api PATCH "$API/v9/projects/$PROJECT" "$W2_BODY"
  local k; k=$(classify "$CURL_RC" "$API_STATUS")
  say "  write 2: HTTP ${API_STATUS:-none} (curl $CURL_RC) -> $k"
  local now
  if ! fetch_project "$EVID/project-restore-check.json"; then
    recovery "restoration was sent but the project could not be read back"
  fi
  if ! now=$(project_buildcommand "$EVID/project-restore-check.json"); then
    recovery "restoration was sent but the project's buildCommand is unreadable"
  fi
  local want; want=$(python3 -c 'import json,sys; sys.stdout.write(json.load(open(sys.argv[1])))' "$ORIG_FILE")
  if [ "$now" = "$want" ]; then
    say "  restored, byte-for-byte identical to the preserved original"
    phase=RESTORED
    return 0
  fi
  recovery "restoration did not produce the original value byte-for-byte"
}

on_exit() {
  local rc=$?
  if [ "$phase" = "APPLIED" ] || [ "$phase" = "MAYBE_APPLIED" ]; then
    say ""
    say "!! the temporary value may still be applied — restoring before exit"
    restore
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'say ""; say "interrupted"; exit 130' INT TERM HUP

# ---------------------------------------------------------------- preservation
say "PROOF 3 — deployment settings: historical, or following the project?"
say "  project    $PROJECT"
say "  deployment $DEPLOY"
say ""

say "1 preserving the historical deployment record"
api GET "$API/v13/deployments/$DEPLOY"
[ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ] || fail "could not read $DEPLOY (HTTP ${API_STATUS:-none})"
cp "$API_BODY" "$EVID/deployment-before.json"
python3 - "$EVID/deployment-before.json" "$EVID/deployment-five-before.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1])); ps=d.get("projectSettings") or {}
K=("rootDirectory","installCommand","buildCommand","outputDirectory","framework")
raw={k:ps[k] for k in K if k in ps}
norm={k:(ps.get(k) if ps.get(k) is not None else None) for k in K}
json.dump({"raw":raw,"normalized":norm,"absent":[k for k in K if k not in ps]}, open(sys.argv[2],"w"), indent=2)
print("    raw fields present :", sorted(raw))
print("    absent             :", [k for k in K if k not in ps])
PY

say ""
say "2 preserving the project, and the original buildCommand"
api GET "$API/v9/projects/$PROJECT"
[ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ] || fail "could not read the project (HTTP ${API_STATUS:-none})"
cp "$API_BODY" "$EVID/project-before.json"
python3 - "$EVID/project-before.json" "$ORIG_FILE" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
v=d.get("buildCommand")
if not isinstance(v,str) or not v:
    print("    the project has no readable buildCommand"); raise SystemExit(1)
json.dump(v, open(sys.argv[2],"w"))
print("    original length    :", len(v))
PY
[ $? -eq 0 ] || fail "the original buildCommand could not be preserved"

# Round trip: what we saved must be exactly what the API returned.
python3 - "$EVID/project-before.json" "$ORIG_FILE" <<'PY'
import json,sys
api=json.load(open(sys.argv[1]))["buildCommand"]
kept=json.load(open(sys.argv[2]))
print("    round-trip         :", "identical" if api==kept else "DIFFERS")
raise SystemExit(0 if api==kept else 1)
PY
[ $? -eq 0 ] || fail "the preserved original does not round-trip; nothing was written"

say ""
say "3 the project's other four settings, target and aliases"
python3 - "$EVID/project-before.json" "$EVID/project-four-before.json" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
four={k:d.get(k) for k in ("rootDirectory","installCommand","outputDirectory","framework")}
t=(d.get("targets") or {}).get("production") or {}
json.dump({"four":four,"productionTarget":t.get("id")}, open(sys.argv[2],"w"), indent=2)
print("    four settings      :", four)
print("    production target  :", t.get("id"))
PY
api GET "$API/v4/aliases?projectId=$PROJECT&limit=50"
cp "$API_BODY" "$EVID/aliases-before.json"
api GET "$API/v6/deployments?projectId=$PROJECT&limit=20"
cp "$API_BODY" "$EVID/deployments-before.json"
python3 -c '
import json,sys
a=json.load(open(sys.argv[1])); d=json.load(open(sys.argv[2]))
print("    aliases            :", len(a.get("aliases",[])))
print("    deployments        :", len(d.get("deployments",[])))' "$EVID/aliases-before.json" "$EVID/deployments-before.json"

say ""
say "4 building the temporary value"
python3 - "$ORIG_FILE" "$W1_BODY" "$W2_BODY" "$PREFIX" "$MAXLEN" <<'PY'
import json,sys
orig=json.load(open(sys.argv[1])); prefix=sys.argv[4]; maxlen=int(sys.argv[5])
temp=prefix+orig
print("    temporary length   : %d (ceiling %d)" % (len(temp), maxlen))
if len(temp)>maxlen:
    print("    OVER THE CEILING"); raise SystemExit(1)
json.dump({"buildCommand":temp}, open(sys.argv[2],"w"))
json.dump({"buildCommand":orig}, open(sys.argv[3],"w"))
print("    write 1 body       : buildCommand only")
print("    write 2 body       : buildCommand only, the preserved original")
PY
[ $? -eq 0 ] || fail "the temporary command exceeds Vercel's length ceiling; nothing was written"

# ------------------------------------------------------------------- write one
say ""
say "5 WRITE 1 — applying the temporary value"
phase=MAYBE_APPLIED          # before the write, not after
api PATCH "$API/v9/projects/$PROJECT" "$W1_BODY"
k=$(classify "$CURL_RC" "$API_STATUS")
say "    HTTP ${API_STATUS:-none} (curl $CURL_RC) -> $k"

case "$k" in
  definite)
    # A 4xx that is not 408 or 429 is a refusal: the write did not happen. This
    # is the same definite/ambiguous split the release uses, and it matters here
    # because a refusal is often a permissions problem — in which case a
    # "restoring" write would fail too and manufacture a false RECOVERY_REQUIRED.
    phase=PRE
    say "    a definite refusal: nothing was changed, so there is nothing to restore"
    verdict=REFUSED
    exit 1 ;;
  ambiguous)
    say "    ambiguous. Reading the project to establish what is actually set."
    if ! fetch_project "$EVID/project-ambiguous-check.json"; then
      recovery "write 1 was ambiguous and the project could not be read back"
    fi
    if ! now=$(project_buildcommand "$EVID/project-ambiguous-check.json"); then
      recovery "write 1 was ambiguous and the project's buildCommand is unreadable"
    fi
    want_orig=$(python3 -c 'import json,sys; sys.stdout.write(json.load(open(sys.argv[1])))' "$ORIG_FILE")
    want_temp=$(python3 -c 'import json,sys; sys.stdout.write(json.load(open(sys.argv[1]))["buildCommand"])' "$W1_BODY")
    if [ "$now" = "$want_orig" ]; then
      phase=PRE
      say "    the write did not apply; the original is intact. Stopping."
      verdict=NOT_APPLIED
      exit 1
    elif [ "$now" = "$want_temp" ]; then
      say "    the write DID apply. Restoring immediately, without continuing."
      phase=APPLIED
      restore
      verdict=AMBIGUOUS_APPLIED_RESTORED
      exit 1
    else
      recovery "write 1 was ambiguous and the project holds neither the original nor the temporary value"
    fi ;;
  success)
    phase=APPLIED ;;
esac

# ---------------------------------------------------------------- observations
say ""
say "6 proving the project changed"
fetch_project "$EVID/project-during.json" || fail "the project could not be read after write 1"
now=$(project_buildcommand "$EVID/project-during.json") || fail "the project's buildCommand is unreadable"
want_temp=$(python3 -c 'import json,sys; sys.stdout.write(json.load(open(sys.argv[1]))["buildCommand"])' "$W1_BODY")
[ "$now" = "$want_temp" ] || fail "the project's buildCommand is not the temporary value"
say "    the project's buildCommand now begins: ${now:0:40}…"
python3 - "$EVID/project-before.json" "$EVID/project-during.json" <<'PY'
import json,sys
b=json.load(open(sys.argv[1])); d=json.load(open(sys.argv[2]))
ok=all(b.get(k)==d.get(k) for k in ("rootDirectory","installCommand","outputDirectory","framework"))
print("    other four settings unchanged :", ok)
raise SystemExit(0 if ok else 1)
PY
[ $? -eq 0 ] || fail "a setting other than buildCommand changed"

say ""
say "7 did the settings change create a deployment?"
api GET "$API/v6/deployments?projectId=$PROJECT&limit=20"
cp "$API_BODY" "$EVID/deployments-during.json"
python3 - "$EVID/deployments-before.json" "$EVID/deployments-during.json" <<'PY'
import json,sys
def ids(p): return [x.get("uid") for x in json.load(open(p)).get("deployments",[])]
b,d=ids(sys.argv[1]), ids(sys.argv[2])
new=[x for x in d if x not in b]
print("    deployments before/after : %d / %d" % (len(b), len(d)))
print("    NEW deployments          :", new or "none")
raise SystemExit(1 if new else 0)
PY
[ $? -eq 0 ] || fail "a new deployment appeared after the settings change"

say ""
say "8 THE MEASUREMENT — reading the historical deployment by its exact id"
api GET "$API/v13/deployments/$DEPLOY"
[ "$CURL_RC" = "0" ] && [ "$API_STATUS" = "200" ] || fail "could not re-read $DEPLOY"
cp "$API_BODY" "$EVID/deployment-during.json"
python3 - "$EVID/deployment-before.json" "$EVID/deployment-during.json" "$EVID/deployment-five-during.json" <<'PY'
import json,sys
K=("rootDirectory","installCommand","buildCommand","outputDirectory","framework")
b=(json.load(open(sys.argv[1])).get("projectSettings") or {})
d=(json.load(open(sys.argv[2])).get("projectSettings") or {})
raw_b={k:b[k] for k in K if k in b}; raw_d={k:d[k] for k in K if k in d}
n_b={k:b.get(k) for k in K}; n_d={k:d.get(k) for k in K}
json.dump({"raw":raw_d,"normalized":n_d}, open(sys.argv[3],"w"), indent=2)
print("    raw identical        :", raw_b==raw_d)
print("    normalized identical :", n_b==n_d)
for k in K:
    if b.get(k)!=d.get(k) or (k in b)!=(k in d):
        print("      CHANGED %s: %r -> %r" % (k, b.get(k), d.get(k)))
print()
print("    HISTORICAL" if raw_b==raw_d else "    NOT HISTORICAL — the deployment followed the project")
raise SystemExit(0 if raw_b==raw_d else 3)
PY
HISTORICAL=$?

say ""
say "9 production target and aliases during the change"
api GET "$API/v4/aliases?projectId=$PROJECT&limit=50"
cp "$API_BODY" "$EVID/aliases-during.json"
python3 - "$EVID/aliases-before.json" "$EVID/aliases-during.json" "$EVID/project-before.json" "$EVID/project-during.json" <<'PY'
import json,sys
def amap(p): return {a["alias"]:(a.get("deploymentId")) for a in json.load(open(p)).get("aliases",[])}
b,d=amap(sys.argv[1]), amap(sys.argv[2])
moved=[h for h in b if b[h]!=d.get(h)]
added=[h for h in d if h not in b]
print("    aliases moved :", moved or "none")
print("    aliases added :", added or "none")
tb=((json.load(open(sys.argv[3])).get("targets") or {}).get("production") or {}).get("id")
td=((json.load(open(sys.argv[4])).get("targets") or {}).get("production") or {}).get("id")
print("    production target: %s -> %s  %s" % (tb, td, "unchanged" if tb==td else "CHANGED"))
raise SystemExit(0 if (not moved and tb==td) else 1)
PY
[ $? -eq 0 ] || fail "routing changed during the experiment"

# ------------------------------------------------------------------- write two
restore
phase=RESTORED

say ""
say "10 final verification"
fetch_project "$EVID/project-after.json" || fail "the project could not be read at the end"
api GET "$API/v13/deployments/$DEPLOY"
cp "$API_BODY" "$EVID/deployment-after.json"
api GET "$API/v4/aliases?projectId=$PROJECT&limit=50"
cp "$API_BODY" "$EVID/aliases-after.json"
api GET "$API/v6/deployments?projectId=$PROJECT&limit=20"
cp "$API_BODY" "$EVID/deployments-after.json"
python3 - "$EVID" <<'PY'
import json,sys,os
E=sys.argv[1]
def J(n): return json.load(open(os.path.join(E,n)))
K=("rootDirectory","installCommand","buildCommand","outputDirectory","framework")
pb,pa=J("project-before.json"),J("project-after.json")
ok_cmd = pb.get("buildCommand")==pa.get("buildCommand")
ok_four= all(pb.get(k)==pa.get(k) for k in K if k!="buildCommand")
db,da=(J("deployment-before.json").get("projectSettings") or {}),(J("deployment-after.json").get("projectSettings") or {})
ok_dep = {k:db[k] for k in K if k in db}=={k:da[k] for k in K if k in da}
def amap(n): return {a["alias"]:a.get("deploymentId") for a in J(n).get("aliases",[])}
ok_al = amap("aliases-before.json")==amap("aliases-after.json")
tb=((pb.get("targets") or {}).get("production") or {}).get("id")
ta=((pa.get("targets") or {}).get("production") or {}).get("id")
def ids(n): return [x.get("uid") for x in J(n).get("deployments",[])]
ok_dl = ids("deployments-before.json")==ids("deployments-after.json")
rows=[("project buildCommand restored byte-for-byte", ok_cmd),
      ("other four project settings unchanged", ok_four),
      ("historical deployment record unchanged", ok_dep),
      ("aliases unchanged", ok_al),
      ("production target unchanged", tb==ta),
      ("deployment list unchanged", ok_dl)]
for n,v in rows: print("    %s  %s" % ("ok  " if v else "FAIL", n))
raise SystemExit(0 if all(v for _,v in rows) else 1)
PY
[ $? -eq 0 ] || fail "final verification did not pass"

# A record that FOLLOWED the project is the finding, and it must not wash out
# here. The final check compares before against after, and after a correct
# restoration a following record matches again — the difference is only visible
# while the temporary value is applied. So it is carried out of step 8
# deliberately rather than recomputed from the end state.
if [ "${HISTORICAL:-0}" != "0" ]; then
  say ""
  say "PROOF 3 — the deployment's settings FOLLOWED the project."
  say "  Read-back describes settings the deployment was not built with."
  say "  The project has been restored and nothing else was changed."
  verdict=NOT_HISTORICAL
  exit 1
fi
verdict=PASSED
say ""
say "PROOF 3 COMPLETE — verdict $verdict"
