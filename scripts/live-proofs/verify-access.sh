#!/bin/sh
#
# Read-only access check for the disposable repository.
#
#   sh scripts/live-proofs/verify-access.sh
#
# READS ONLY. Nothing here creates, updates, deletes or pushes anything.
#
# The token is never an argument. curl reads its configuration from stdin, the
# same way the provenance build command does, so no Authorization header reaches
# ps, process accounting or a trace. Nothing printed below contains the token.
set -u

DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
FILE="$DIR/github-token"
OWNER=Price2Book
REPO=p2b-release-proofs

refuse() { echo "REFUSING: $*" >&2; exit 1; }

[ -L "$FILE" ] && refuse "$FILE is a symlink"
[ -f "$FILE" ] || refuse "no token at $FILE — run credential-input.sh github first"
[ -s "$FILE" ] || refuse "$FILE is empty"
tok=$(cat "$FILE") || refuse "could not read $FILE"
[ -n "$tok" ] || refuse "$FILE holds no value"

# status + body, with the body on stdout and the status on the last line
get() {
  printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nheader = "X-GitHub-Api-Version: 2022-11-28"\nsilent\nshow-error\nconnect-timeout = 10\nmax-time = 30\nwrite-out = "\\nHTTP_STATUS:%%{http_code}"\n' \
    "$1" "$tok" | curl --config - 2>/dev/null
}

status_of() { printf '%s' "$1" | sed -n 's/.*HTTP_STATUS:\([0-9]*\)$/\1/p' | tail -1; }
body_of()   { printf '%s' "$1" | sed 's/HTTP_STATUS:[0-9]*$//'; }

echo "READ-ONLY ACCESS CHECK — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo

# 1. The repository itself.
r=$(get "https://api.github.com/repos/$OWNER/$REPO")
s=$(status_of "$r")
echo "1 GET /repos/$OWNER/$REPO"
echo "    HTTP $s"
if [ "$s" = "200" ]; then
  body_of "$r" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for k in ("id","full_name","private","default_branch","size","pushed_at","archived","fork"):
    label = k + ":"
    print("    %-16s %r" % (label, d.get(k)))
print("    %-16s %s" % ("permissions:", d.get("permissions") or {}))
'
else
  echo "    body: $(body_of "$r" | tr -d '\n' | cut -c1-160)"
fi
echo

# 2. The ref the guard reads. An empty repository has no main yet, and a 404
#    here is the repository's state, not a token problem.
r=$(get "https://api.github.com/repos/$OWNER/$REPO/git/ref/heads/main")
s=$(status_of "$r")
echo "2 GET /repos/$OWNER/$REPO/git/ref/heads/main   (the guard's fresh-main read)"
echo "    HTTP $s   $(body_of "$r" | python3 -c 'import json,sys
try:
  d=json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print(d.get("message") or (d.get("object") or {}).get("sha",""))' 2>/dev/null)"
echo

# 3. The path the build command downloads.
r=$(get "https://api.github.com/repos/$OWNER/$REPO/contents/scripts/provenance-guard.sh")
s=$(status_of "$r")
echo "3 GET contents/scripts/provenance-guard.sh      (the guard download)"
echo "    HTTP $s   $(body_of "$r" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print(d.get("message") or d.get("sha",""))' 2>/dev/null)"
echo

# 4. Reads that need permissions we deliberately did NOT grant. A refusal is
#    evidence the token is narrower than the account behind it.
#
#    `collaborators` was tried first and is NOT evidence: it can answer 200 on a
#    repository the account owns, so it says nothing about the token's grant.
#    These endpoints each require their own scope, which was left at No access.
echo "4 reads requiring scopes that were NOT granted (each should refuse)"
for probe in "actions/secrets:Secrets" "hooks:Webhooks" "actions/variables:Variables"; do
  path=${probe%%:*}; label=${probe#*:}
  r=$(get "https://api.github.com/repos/$OWNER/$REPO/$path")
  s=$(status_of "$r")
  msg=$(body_of "$r" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: print(""); raise SystemExit
print(d.get("message","") if isinstance(d,dict) else "returned a list")' 2>/dev/null)
  printf "    %-24s HTTP %-4s %s\n" "$label ($path)" "$s" "$msg"
done

tok=''
