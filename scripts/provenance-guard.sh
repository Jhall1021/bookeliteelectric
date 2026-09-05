#!/bin/sh
# Production provenance guard — runs INSIDE the Vercel build, before anything else.
#
# Refuses the build unless every fact holds:
#   VERCEL_ENV=production, provider github, owner Jhall1021, repo bookeliteelectric,
#   ref main, a full commit SHA, and a FRESH authenticated read of GitHub refs/heads/main
#   equal to that SHA. Any missing fact, and an unreadable GitHub, is a refusal.
#
# It is NOT run from the deployed tree. The canonical project's Build Command fetches
# this file from GitHub `main` (see PROVENANCE_BUILD_COMMAND in scripts/_releaseProvenance.ts),
# so a checkout that predates it, or that removed it, meets it anyway. Mirrors
# decideBuildProvenance() in that module; scripts/verify-release-provenance.ts runs both
# against one fact table and fails if they disagree.
#
# POSIX sh. No repository files are read: this guard is fetched from GitHub at
# build time, so an old checkout cannot carry an old guard.
OWNER=Jhall1021
REPO=bookeliteelectric
REF=main
# THE FRESH-MAIN READ IS AUTHENTICATED BY CHOICE. The canonical repository is
# PUBLIC, so this read would usually succeed anonymously — but an authenticated
# read fails closed on a bad or missing credential instead of degrading to an
# anonymous, rate-limited one, and NO_READ_CREDENTIAL below depends on the
# credential being required.
#
# The token is NEVER an argument. A header on the command line is visible through
# ps, process accounting, and tracing, so it reaches curl through a --config file
# on stdin instead.
#
# P2B_MAIN_API IS PINNED IN PRODUCTION. It exists so the verifier can point the
# read at an unreachable host, but an environment variable that can replace the
# endpoint this guard validates against is an environment variable that can
# decide the answer. In a production build the canonical URL is used and the
# override is ignored outright — not merely unset by convention.
refuse() { echo "PROVENANCE REFUSED ($1): $2"; exit 1; }
CANONICAL_API="https://api.github.com/repos/$OWNER/$REPO/git/ref/heads/$REF"
if [ "${VERCEL_ENV:-}" = "production" ]; then
  API="$CANONICAL_API"
  [ -n "${P2B_MAIN_API:-}" ] && refuse OVERRIDE_IN_PRODUCTION "P2B_MAIN_API is set in a production build"
else
  API="${P2B_MAIN_API:-$CANONICAL_API}"
fi
[ "${VERCEL_ENV:-}" = "production" ] || refuse NOT_PRODUCTION "target is \"${VERCEL_ENV:-}\", not production"
[ "${VERCEL_GIT_PROVIDER:-}" = "github" ] || refuse NOT_GITHUB "git provider is \"${VERCEL_GIT_PROVIDER:-}\" - not a GitHub-triggered build"
[ "${VERCEL_GIT_REPO_OWNER:-}" = "$OWNER" ] || refuse WRONG_OWNER "repository owner is \"${VERCEL_GIT_REPO_OWNER:-}\""
[ "${VERCEL_GIT_REPO_SLUG:-}" = "$REPO" ] || refuse WRONG_REPO "repository is \"${VERCEL_GIT_REPO_SLUG:-}\""
[ "${VERCEL_GIT_COMMIT_REF:-}" = "$REF" ] || refuse WRONG_REF "ref is \"${VERCEL_GIT_COMMIT_REF:-}\""
SHA="${VERCEL_GIT_COMMIT_SHA:-}"
case "$SHA" in
  ????????????????????????????????????????) ;;
  *) refuse NO_SHA "no full commit SHA on this deployment" ;;
esac
[ -n "${P2B_GH_READ_TOKEN:-}" ] || refuse NO_READ_CREDENTIAL "no repository read credential in the build environment"

# THE CREDENTIAL IS INTERPOLATED INTO A CURL CONFIG, so a value carrying a
# newline could add directives of its own — another url, an output file.
#
# This refuses the characters that can BREAK OUT of a quoted config line rather
# than allow-listing the ones a token may contain. An allowlist was tried first
# and it rejected perfectly good test credentials, which is the failure mode an
# allowlist has in production too: a future token format nobody anticipated
# would stop a release for no security reason.
case "$P2B_GH_READ_TOKEN" in
  *[[:space:]]*|*'"'*|*'\'*)
    refuse MALFORMED_CREDENTIAL "the read credential contains whitespace or quoting characters" ;;
esac

# THE FETCH'S EXIT STATUS IS CHECKED ON ITS OWN.
#
# Written as one pipeline this was silently broken: a pipeline reports the LAST
# command's status, so curl exiting 28 on a timeout still produced status 0 and
# whatever the parser scraped out of partial output was accepted as main. So the
# fetch is its own statement, its status is tested before anything is parsed, and
# the timeouts are bounded so a hanging GitHub refuses rather than stalls a build.
BODY=$(printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nsilent\nshow-error\nfail\nconnect-timeout = 10\nmax-time = 30\n' "$API" "$P2B_GH_READ_TOKEN" | curl --config - 2>/dev/null)
RC=$?
[ "$RC" -eq 0 ] || refuse MAIN_UNREADABLE "GitHub read failed (curl exit $RC); refusing rather than guessing"
[ -n "$BODY" ] || refuse MAIN_UNREADABLE "GitHub returned an empty body"

# PARSED, NOT SCRAPED.
#
# Matching '"ref"' and a 40-hex string anywhere in the body accepted three things
# it should not have: invalid JSON, a response whose real ref differed while
# "refs/heads/main" appeared elsewhere in it, and an object of type "blob" whose
# sha is a file's, not a commit's. So the body is parsed, and the ref, the object
# type and the sha are each required to be what they claim.
#
# node is present: this runs inside the Vercel build, immediately before
# `npm run build`. If it is somehow absent, that is a refusal like any other
# missing fact.
command -v node >/dev/null 2>&1 || refuse NO_PARSER "node is not available to parse the GitHub response"

MAIN=$(printf '%s' "$BODY" | node -e '
  let s = "";
  process.stdin.on("data", (d) => (s += d));
  process.stdin.on("end", () => {
    let j;
    try { j = JSON.parse(s); } catch { process.exit(3); }
    if (!j || typeof j !== "object") process.exit(3);
    if (j.ref !== "refs/heads/" + process.argv[1]) process.exit(4);
    const o = j.object;
    if (!o || typeof o !== "object") process.exit(5);
    if (o.type !== "commit") process.exit(6);
    if (typeof o.sha !== "string" || !/^[0-9a-f]{40}$/.test(o.sha)) process.exit(7);
    process.stdout.write(o.sha);
  });
' "$REF" 2>/dev/null)
PRC=$?
case "$PRC" in
  0) ;;
  3) refuse MAIN_UNREADABLE "GitHub response is not valid JSON" ;;
  4) refuse MAIN_UNREADABLE "response is not the refs/heads/$REF object" ;;
  5) refuse MAIN_UNREADABLE "ref object has no object field" ;;
  6) refuse MAIN_UNREADABLE "refs/heads/$REF does not point at a commit" ;;
  7) refuse MAIN_UNREADABLE "ref object carries no valid commit sha" ;;
  *) refuse MAIN_UNREADABLE "GitHub response could not be parsed (exit $PRC)" ;;
esac
[ -n "$MAIN" ] || refuse MAIN_UNREADABLE "no commit sha in the ref object"
[ "$MAIN" = "$SHA" ] || refuse SHA_NOT_MAIN "commit $SHA is not GitHub $REF $MAIN"
echo "PROVENANCE OK $SHA"
