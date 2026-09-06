#!/bin/sh
#
# Snapshot the disposable repository and project.
#
#   sh scripts/live-proofs/capture-state.sh <label>
#
# READS ONLY. The same script captures before and after, so the two snapshots
# are comparable by construction rather than by whoever typed them.
set -u

LABEL="${1:?usage: capture-state.sh <label>}"
DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
OWNER=Price2Book
REPO=p2b-release-proofs
PROJECT=prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q
EXPECTED_GUARD=9d9139d2913aa2deb22db5bb86b56a96bc5f9f1a
GUARD_PATH=scripts/provenance-guard.sh

refuse() { echo "REFUSING: $*" >&2; exit 1; }
. "$(dirname "$0")/credential-shape.sh"
. "$(dirname "$0")/canonical-guard.sh"

gh=$(cat "$DIR/github-token" 2>/dev/null) || refuse "no GitHub token"
vc=$(cat "$DIR/vercel-token" 2>/dev/null) || refuse "no Vercel token"
credential_shape_check github "$gh" || exit 1
credential_shape_check vercel "$vc" || exit 1

req() {  # req <url> <token>
  canonical_guard "$1" || exit 1
  printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nsilent\nshow-error\nconnect-timeout = 10\nmax-time = 30\n' "$1" "$2" | curl --config - 2>/dev/null
}

echo "STATE SNAPSHOT — $LABEL"
echo "  captured $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

echo "GITHUB $OWNER/$REPO"
ref=$(req "https://api.github.com/repos/$OWNER/$REPO/git/ref/heads/main" "$gh")
sha=$(printf '%s' "$ref" | python3 -c 'import json,sys
try: print((json.load(sys.stdin).get("object") or {}).get("sha",""))
except Exception: print("")')
if [ -z "$sha" ]; then
  echo "  main            UNREADABLE: $(printf '%s' "$ref" | tr -d '\n' | cut -c1-120)"
else
  echo "  main sha        $sha"
  req "https://api.github.com/repos/$OWNER/$REPO/commits/$sha" "$gh" | python3 -c '
import json,sys
d=json.load(sys.stdin); c=d.get("commit",{})
print("  message         %s" % (c.get("message","").splitlines() or [""])[0])
print("  committed       %s" % (c.get("committer",{}) or {}).get("date"))
print("  verification    %s" % (c.get("verification",{}) or {}).get("reason"))
ps=[p.get("sha") for p in d.get("parents",[])]
print("  parents         %s" % (ps or ["(root commit)"]))'
  blob=$(req "https://api.github.com/repos/$OWNER/$REPO/git/trees/$sha?recursive=1" "$gh" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("truncated"): print("TRUNCATED"); raise SystemExit
for e in d.get("tree",[]):
    if e["path"]=="'"$GUARD_PATH"'" and e["type"]=="blob": print(e["sha"]); break')
  echo "  guard blob      ${blob:-(absent)}"
  [ "$blob" = "$EXPECTED_GUARD" ] && echo "  guard pinned    yes, matches $EXPECTED_GUARD" \
                                  || echo "  guard pinned    NO — expected $EXPECTED_GUARD"
fi
echo

echo "VERCEL $PROJECT"
proj=$(req "https://api.vercel.com/v9/projects/$PROJECT" "$vc")
printf '%s' "$proj" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  effective build configuration")
for k in ("rootDirectory","installCommand","buildCommand","outputDirectory","framework"):
    v=d.get(k)
    if k=="buildCommand" and v: print("    %-16s %s" % (k, v))
    else: print("    %-16s %r" % (k, v))'
echo

# THE PRODUCTION TARGET, READ AND VALIDATED — never inferred.
#
# Reconciling proof 4 case 1 needed this field and the snapshot did not carry
# it, so the conclusion had to be reasoned out of the target's creation
# timestamp instead. That worked and should not have been necessary.
#
# It is recorded SEPARATELY from the alias mappings because they are separate
# facts: two generated aliases moved on that deployment while the production
# target did not, and a snapshot that blurred them would have hidden exactly the
# distinction the reconciliation turned on.
#
# An unreadable, missing, malformed or ambiguous target REFUSES. A recorded
# value that was really a guess is worse than no value at all.
echo "  production target"
target=$(printf '%s' "$proj" | python3 -c '
import json, re, sys
try:
    d = json.load(sys.stdin)
except Exception as e:
    print("UNREADABLE the project response is not JSON (%s)" % e); raise SystemExit
if isinstance(d, dict) and "error" in d:
    print("UNREADABLE the project response is an error: %s"
          % str((d.get("error") or {}).get("message"))[:120]); raise SystemExit
if not isinstance(d, dict):
    print("UNREADABLE the project response is not an object"); raise SystemExit
if "targets" not in d:
    print("MISSING the project response carries no targets field"); raise SystemExit
t = d.get("targets")
if not isinstance(t, dict):
    print("MALFORMED targets is not an object (%r)" % (t,)); raise SystemExit
if "production" not in t:
    print("MISSING targets carries no production entry"); raise SystemExit
p = t.get("production")
if p is None:
    print("MISSING targets.production is null"); raise SystemExit
if not isinstance(p, dict):
    print("MALFORMED targets.production is not an object (%r)" % (p,)); raise SystemExit
# Every id-bearing field must agree. Two different ids is not a target.
ids = {p[k] for k in ("id", "deploymentId", "uid") if k in p and p[k] is not None}
if not ids:
    print("MISSING targets.production carries no deployment id"); raise SystemExit
if len(ids) > 1:
    print("AMBIGUOUS targets.production names more than one deployment: %s"
          % ", ".join(sorted(map(repr, ids)))); raise SystemExit
dep = ids.pop()
if not isinstance(dep, str) or not re.fullmatch(r"dpl_[A-Za-z0-9]+", dep):
    print("MALFORMED the production deployment id is not a deployment id (%r)" % (dep,)); raise SystemExit
print("OK %s %s" % (dep, p.get("readyState")))
')
case "$target" in
  "OK "*)
    set -- $target
    echo "    deployment id   $2"
    echo "    readyState      $3" ;;
  "")
    refuse "the production target could not be read at all (no output)" ;;
  *)
    echo "    UNREAD: $target"
    refuse "the production target is $target" ;;
esac
echo
echo "  deployments (most recent first)"
req "https://api.vercel.com/v6/deployments?projectId=$PROJECT&limit=10" "$vc" | python3 -c '
import json,sys,datetime
d=json.load(sys.stdin)
ds=d.get("deployments",[])
if not ds: print("    (none)")
for x in ds:
    t=x.get("created") or x.get("createdAt")
    when=datetime.datetime.utcfromtimestamp(t/1000).isoformat()+"Z" if t else "?"
    m=x.get("meta") or {}
    print("    %s" % x.get("uid"))
    print("      state %-9s target %-11s %s" % (x.get("state"), x.get("target"), when))
    print("      source %-8s importSource %r" % (x.get("source"), m.get("importSource")))
    print("      commit %s" % m.get("githubCommitSha"))'
echo
echo "  aliases"
req "https://api.vercel.com/v4/aliases?projectId=$PROJECT&limit=50" "$vc" | python3 -c '
import json,sys
d=json.load(sys.stdin)
al=d.get("aliases",[])
if not al: print("    (none)")
for a in sorted(al, key=lambda x: x.get("alias","")):
    print("    %-52s -> %s" % (a.get("alias"), a.get("deploymentId") or (a.get("deployment") or {}).get("id")))
print("    pagination next: %r" % ((d.get("pagination") or {}).get("next")))'
gh=''; vc=''
