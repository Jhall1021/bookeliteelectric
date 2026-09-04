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
req "https://api.vercel.com/v9/projects/$PROJECT" "$vc" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("  effective build configuration")
for k in ("rootDirectory","installCommand","buildCommand","outputDirectory","framework"):
    v=d.get(k)
    if k=="buildCommand" and v: print("    %-16s %s" % (k, v))
    else: print("    %-16s %r" % (k, v))'
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
