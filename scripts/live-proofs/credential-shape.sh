# Shared credential-shape check. Sourced, not run.
#
#   . "$(dirname "$0")/credential-shape.sh"
#   credential_shape_check vercel "$tok" || exit 1
#
# A GitHub token was once entered into the Vercel slot. Every Vercel endpoint
# answered 403 "Not authorized", which reads exactly like a scope problem, and
# the wrong credential was sent to a third party before anyone noticed. The
# shape was knowable before the first request.
#
# HARD REFUSAL only where the value is DEFINITELY the other kind — a GitHub
# prefix in the Vercel slot, a Vercel-shaped value in the GitHub slot. Anything
# merely unfamiliar warns and proceeds, because a token format that changes
# should not stop the work.

credential_shape_check() {
  _kind="$1"; _val="$2"
  case "$_kind" in
    vercel)
      case "$_val" in
        github_pat_*|ghp_*|gho_*|ghu_*|ghs_*|ghr_*)
          echo "REFUSING: this is a GitHub token, not a Vercel one." >&2
          echo "  It starts with a GitHub prefix. Sending it to api.vercel.com" >&2
          echo "  would disclose a credential to a service it was not issued for." >&2
          return 1 ;;
      esac
      if ! printf '%s' "$_val" | grep -qE '^[A-Za-z0-9]{24}$'; then
        echo "note: this does not look like the usual 24-character Vercel token; continuing." >&2
      fi
      ;;
    github)
      if printf '%s' "$_val" | grep -qE '^[A-Za-z0-9]{24}$'; then
        echo "REFUSING: this looks like a Vercel token, not a GitHub one." >&2
        echo "  Sending it to api.github.com would disclose a credential to a" >&2
        echo "  service it was not issued for." >&2
        return 1
      fi
      case "$_val" in
        github_pat_*|ghp_*|gho_*|ghu_*|ghs_*|ghr_*) ;;
        *) echo "note: this does not carry a familiar GitHub token prefix; continuing." >&2 ;;
      esac
      ;;
  esac
  return 0
}
