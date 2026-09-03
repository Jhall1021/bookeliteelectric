#!/bin/sh
# Production provenance guard — runs INSIDE the Vercel build, before anything else.
#
# Refuses the build unless every fact holds:
#   VERCEL_ENV=production, provider github, owner Jhall1021, repo bookeliteelectric,
#   ref main, a full commit SHA, and a FRESH `git ls-remote` of GitHub refs/heads/main
#   equal to that SHA. Any missing fact, and an unreadable GitHub, is a refusal.
#
# It is NOT run from the deployed tree. The canonical project's Build Command fetches
# this file from GitHub `main` (see PROVENANCE_BUILD_COMMAND in scripts/_releaseProvenance.ts),
# so a checkout that predates it, or that removed it, meets it anyway. Mirrors
# decideBuildProvenance() in that module; scripts/verify-release-provenance.ts runs both
# against one fact table and fails if they disagree.
#
# POSIX sh. No secrets, no tokens, no repository files. P2B_MAIN_REMOTE exists only so
# the verifier can point the network read at an unreachable host; production never sets it.
OWNER=Jhall1021
REPO=bookeliteelectric
REF=main
REMOTE="${P2B_MAIN_REMOTE:-https://github.com/$OWNER/$REPO.git}"
refuse() { echo "PROVENANCE REFUSED ($1): $2"; exit 1; }
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
MAIN=$(git ls-remote "$REMOTE" "refs/heads/$REF" 2>/dev/null | cut -f1)
[ -n "$MAIN" ] || refuse MAIN_UNREADABLE "GitHub refs/heads/$REF could not be read; refusing rather than guessing"
[ "$MAIN" = "$SHA" ] || refuse SHA_NOT_MAIN "commit $SHA is not GitHub $REF $MAIN"
echo "PROVENANCE OK $SHA"
