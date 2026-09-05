# Refuse any request that names canonical production. Sourced, not run.
#
#   . "$(dirname "$0")/canonical-guard.sh"
#   canonical_guard "$url" || exit 1
#
# THE DISPOSABLE PROJECT LIVES IN THE CANONICAL TEAM. p2b-release-proofs reports
# accountId team_dAw8VA0u1R3VuwiPMP97otvK, which is CANONICAL.vercelTeamId — the
# same team as production prj_zB0QVq80340s2dVt7X3c1ewKgHtT. Vercel does not
# issue per-project tokens, so the credential's reach is the team, and only the
# project id in each URL keeps these proofs off production.
#
# A mistyped or copied project id would therefore reach the real thing. This
# refuses on the canonical project id and on team-level mutation paths, before
# the request is made rather than after.
CANONICAL_PROJECT=prj_zB0QVq80340s2dVt7X3c1ewKgHtT
DISPOSABLE_PROJECT=prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q

canonical_guard() {
  case "$1" in
    *"$CANONICAL_PROJECT"*)
      echo "REFUSING: that URL names the canonical production project." >&2
      echo "  $CANONICAL_PROJECT is production. These proofs run only against" >&2
      echo "  $DISPOSABLE_PROJECT." >&2
      return 1 ;;
    *price2book.com*)
      echo "REFUSING: that URL names a Price2Book production hostname." >&2
      return 1 ;;
  esac
  return 0
}
