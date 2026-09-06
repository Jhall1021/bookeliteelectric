#!/bin/sh
#
# Does this Vercel token actually reach ONLY the disposable project?
#
#   sh scripts/live-proofs/verify-isolation.sh
#
# GET REQUESTS ONLY, and the URLs are built from constants below rather than
# taken as input.
#
# WHY THIS DELIBERATELY REQUESTS THE CANONICAL PROJECT. Isolation cannot be
# established by not looking. The whole question is whether a token that lives
# in the canonical team can reach production, and the only evidence is a
# request that comes back denied. canonical-guard.sh still refuses canonical
# URLs everywhere else; this one check is the narrow, read-only exception, and
# a 200 here is a CRITICAL failure that stops everything.
#
# teamId and team slug are omitted throughout: a project-scoped token carries
# its own scope, and passing a team hint would test something else.
set -u

DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
FILE="$DIR/vercel-token"
DISPOSABLE=prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q
CANONICAL_ID=prj_zB0QVq80340s2dVt7X3c1ewKgHtT
CANONICAL_NAME=price2book
API="${P2B_VERCEL_API:-https://api.vercel.com}"

refuse() { echo "REFUSING: $*" >&2; exit 1; }
[ -L "$FILE" ] && refuse "$FILE is a symlink"
[ -f "$FILE" ] || refuse "no token at $FILE"
tok=$(cat "$FILE") || refuse "could not read $FILE"
[ -n "$tok" ] || refuse "$FILE holds no value"
. "$(dirname "$0")/credential-shape.sh"
credential_shape_check vercel "$tok" || exit 1

status() {   # status only; no body is printed, so nothing leaks from a project
  printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nsilent\nshow-error\noutput = "/dev/null"\nconnect-timeout = 10\nmax-time = 30\nwrite-out = "%%{http_code}"\n' \
    "$1" "$tok" | curl --config - 2>/dev/null
}

fail=0
echo "PROJECT-SCOPE ISOLATION CHECK — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  no teamId or slug is sent; a project-scoped token carries its own scope"
echo

# 1. The project these proofs run against must be reachable.
s=$(status "$API/v9/projects/$DISPOSABLE")
printf "1 disposable project by id        HTTP %-4s " "$s"
if [ "$s" = "200" ]; then echo "reachable"; else echo "NOT REACHABLE — expected 200"; fail=1; fi

# 2 and 3. Production must be denied, by id AND by name. A project-scoped token
#          is documented to deny other projects in the same team; this is that
#          claim tested rather than trusted.
for probe in "id:$CANONICAL_ID" "name:$CANONICAL_NAME"; do
  how=${probe%%:*}; what=${probe#*:}
  s=$(status "$API/v9/projects/$what")
  printf "%s canonical project by %-6s     HTTP %-4s " "$([ "$how" = "id" ] && echo 2 || echo 3)" "$how" "$s"
  case "$s" in
    403|404) echo "denied — correct" ;;
    200)     echo "READABLE — THE TOKEN IS NOT ISOLATED"; fail=2 ;;
    *)       echo "unexpected; treat as unestablished"; fail=1 ;;
  esac
done

# 4. User and team endpoints. For a project-scoped token these SHOULD refuse,
#    and a refusal here is the token behaving as documented — not a failure.
for ep in "v2/user" "v2/teams"; do
  s=$(status "$API/$ep")
  printf "4 %-28s HTTP %-4s " "$ep" "$s"
  # 404 counts as denial. Vercel answers out-of-scope resources with 404 rather
  # than 403 — it declines to acknowledge they exist — which is the same shape
  # the canonical project probes return, and a stronger signal than 403, not a
  # weaker one. Anything that is not a recognised denial leaves isolation
  # unestablished rather than quietly passing.
  case "$s" in
    401|403|404) echo "denied — expected for a project-scoped token" ;;
    200)         echo "READABLE — this token reaches user/team resources"; fail=2 ;;
    *)           echo "unrecognised — isolation unestablished"; fail=1 ;;
  esac
done

echo
if [ "$fail" = "2" ]; then
  echo "REFUSING: this token is NOT confined to the disposable project." >&2
  echo "  Proofs involve creating and promoting deployments. A credential that" >&2
  echo "  can reach production must not be the one that runs them." >&2
  exit 1
fi
[ "$fail" = "0" ] || refuse "isolation could not be established"
echo "ISOLATED: the disposable project is reachable, production is not."
tok=''
