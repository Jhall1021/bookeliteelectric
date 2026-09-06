#!/bin/sh
#
# Read-only inspection of the disposable Vercel project.
#
#   sh scripts/live-proofs/verify-vercel.sh
#
# GET REQUESTS ONLY. Nothing here creates, configures, deploys or promotes.
#
# The token is never an argument: curl takes its configuration from stdin. Env
# var VALUES are never requested — the decrypt parameter is deliberately absent,
# so only names, targets and types are read.
set -u

DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
FILE="$DIR/vercel-token"
PROJECT=prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q
CANONICAL_TEAM=team_dAw8VA0u1R3VuwiPMP97otvK   # never used; guarded against below

refuse() { echo "REFUSING: $*" >&2; exit 1; }
[ -L "$FILE" ] && refuse "$FILE is a symlink"
[ -f "$FILE" ] || refuse "no token at $FILE — run credential-input.sh vercel first"
tok=$(cat "$FILE") || refuse "could not read $FILE"
[ -n "$tok" ] || refuse "$FILE holds no value"

# Nothing is sent until the value is the right KIND of credential.
. "$(dirname "$0")/credential-shape.sh"
credential_shape_check vercel "$tok" || exit 1

. "$(dirname "$0")/canonical-guard.sh"

get() {
  canonical_guard "$1" || exit 1
  printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nsilent\nshow-error\nconnect-timeout = 10\nmax-time = 30\nwrite-out = "\\nHTTP_STATUS:%%{http_code}"\n' \
    "$1" "$tok" | curl --config - 2>/dev/null
}
status_of() { printf '%s' "$1" | sed -n 's/.*HTTP_STATUS:\([0-9]*\)$/\1/p' | tail -1; }
body_of()   { printf '%s' "$1" | sed 's/HTTP_STATUS:[0-9]*$//'; }

echo "VERCEL READ-ONLY INSPECTION — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# 1. Who the token is, and what scope it can see.
echo "1 token scope (403 here is EXPECTED for a project-scoped token)"
for ep in "v2/user" "v2/teams"; do
  r=$(get "https://api.vercel.com/$ep"); s=$(status_of "$r")
  case "$s" in
    401|403) note="denied — expected; a project-scoped token reaches neither" ;;
    200)     note="READABLE — this token is broader than one project" ;;
    *)       note="unexpected" ;;
  esac
  printf "  GET /%-10s HTTP %-4s %s\n" "$ep" "$s" "$note"
done
echo

# 2. The project. NO teamId and NO slug: the token carries its own scope, and
#    supplying a team hint would exercise a different credential shape than the
#    one these proofs run under.
echo "2 project $PROJECT   (no teamId or slug sent)"
r=$(get "https://api.vercel.com/v9/projects/$PROJECT"); s=$(status_of "$r")
echo "  HTTP $s"
[ "$s" = "200" ] || refuse "the project could not be read"
body_of "$r" | python3 -c '
import json,sys
d=json.load(sys.stdin)
print("    name              %s" % d.get("name"))
print("    id                %s" % d.get("id"))
print("    accountId         %s" % d.get("accountId"))
print("    nodeVersion       %s" % d.get("nodeVersion"))
print("    autoAssignCustomDomains %s" % d.get("autoAssignCustomDomains"))
print()
print("    THE FIVE FIELDS compareBuild COMPARES")
for k in ("rootDirectory","installCommand","buildCommand","outputDirectory","framework"):
    print("      %-16s %r" % (k, d.get(k)))
link = d.get("link") or {}
if link:
    print()
    print("    git link")
    for k in ("type","org","repo","repoId","productionBranch"):
        print("      %-16s %r" % (k, link.get(k)))
'
echo

# 3. Environment variable NAMES. Values are not requested.
echo "3 environment variables (names, targets and types only — no values requested)"
r=$(get "https://api.vercel.com/v9/projects/$PROJECT/env"); s=$(status_of "$r")
echo "  HTTP $s"
[ "$s" = "200" ] && body_of "$r" | python3 -c '
import json,sys
d=json.load(sys.stdin)
envs=d.get("envs", d if isinstance(d,list) else [])
if not envs: print("    (none)")
for e in envs:
    print("    %-22s %-28s %s" % (e.get("key"), ",".join(e.get("target") or []), e.get("type")))
'
echo

# 4. Deployments so far.
echo "4 deployments"
r=$(get "https://api.vercel.com/v6/deployments?projectId=$PROJECT&limit=10")
s=$(status_of "$r"); echo "  HTTP $s"
[ "$s" = "200" ] && body_of "$r" | python3 -c '
import json,sys,datetime
d=json.load(sys.stdin)
ds=d.get("deployments",[])
if not ds: print("    (none)")
for x in ds:
    t=x.get("created") or x.get("createdAt")
    when=datetime.datetime.utcfromtimestamp(t/1000).isoformat()+"Z" if t else "?"
    print("    %-24s %-9s %-11s %s" % (x.get("uid"), x.get("state"), x.get("target"), when))
    print("      url  %s" % x.get("url"))
    m=x.get("meta") or {}
    if m: print("      meta %s" % {k:m[k] for k in list(m)[:6]})
'
echo

# 5. Aliases currently pointing anywhere in this project.
echo "5 aliases"
r=$(get "https://api.vercel.com/v4/aliases?projectId=$PROJECT&limit=20")
s=$(status_of "$r"); echo "  HTTP $s"
[ "$s" = "200" ] && body_of "$r" | python3 -c '
import json,sys
d=json.load(sys.stdin)
al=d.get("aliases",[])
if not al: print("    (none)")
for a in al:
    print("    %-46s -> %s" % (a.get("alias"), a.get("deploymentId") or (a.get("deployment") or {}).get("id")))
print("    pagination next: %r" % ((d.get("pagination") or {}).get("next")))
'
tok=''
