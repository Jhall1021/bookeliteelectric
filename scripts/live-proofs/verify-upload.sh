#!/bin/sh
#
# Verify what actually landed in the disposable repository.
#
#   sh scripts/live-proofs/verify-upload.sh
#
# READS ONLY. The token is never an argument: curl takes its configuration from
# stdin, as the provenance build command does. Nothing printed contains it.
#
# The decisive check is the last one. A blob hash reported by the API is the
# API's claim; fetching the CONTENT and hashing it here is the same fact
# established independently, and it is also the exact read the build depends on.
set -u

DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
FILE="$DIR/github-token"
OWNER=Price2Book
REPO=p2b-release-proofs
EXPECTED_GUARD=9d9139d2913aa2deb22db5bb86b56a96bc5f9f1a
GUARD_PATH=scripts/provenance-guard.sh

refuse() { echo "REFUSING: $*" >&2; exit 1; }
[ -L "$FILE" ] && refuse "$FILE is a symlink"
[ -f "$FILE" ] || refuse "no token at $FILE"
tok=$(cat "$FILE") || refuse "could not read $FILE"
[ -n "$tok" ] || refuse "$FILE holds no value"

# Nothing is sent until the value is the right KIND of credential.
. "$(dirname "$0")/credential-shape.sh"
credential_shape_check github "$tok" || exit 1

get() {
  printf 'url = "%s"\nheader = "Authorization: Bearer %s"\nheader = "Accept: application/vnd.github+json"\nheader = "X-GitHub-Api-Version: 2022-11-28"\nsilent\nshow-error\nconnect-timeout = 10\nmax-time = 30\n' \
    "$1" "$tok" | curl --config - 2>/dev/null
}

echo "UPLOAD VERIFICATION — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "  $OWNER/$REPO"
echo

# 1. main, and the commit behind it.
ref=$(get "https://api.github.com/repos/$OWNER/$REPO/git/ref/heads/main")
sha=$(printf '%s' "$ref" | python3 -c 'import json,sys
try: d=json.load(sys.stdin)
except Exception: sys.exit()
print((d.get("object") or {}).get("sha",""))')
[ -n "$sha" ] && [ "$sha" != "None" ] || refuse "main has no commit: $(printf '%s' "$ref" | tr -d '\n' | cut -c1-160)"
echo "1 main commit sha   $sha"

commit=$(get "https://api.github.com/repos/$OWNER/$REPO/commits/$sha")
printf '%s' "$commit" | python3 -c 'import json,sys
d=json.load(sys.stdin)
c=d.get("commit",{})
print("  message           %s" % (c.get("message","").splitlines() or [""])[0])
print("  committed         %s" % (c.get("committer",{}) or {}).get("date"))
print("  tree              %s" % (c.get("tree",{}) or {}).get("sha"))
print("  verified          %s" % ((c.get("verification",{}) or {}).get("verified")))'
echo

# 2. The whole tree, recursively — path AND blob for every file.
tree=$(get "https://api.github.com/repos/$OWNER/$REPO/git/trees/$sha?recursive=1")
echo "2 uploaded tree"
printf '%s' "$tree" | python3 -c '
import json,sys
d=json.load(sys.stdin)
if d.get("truncated"): print("  TRUNCATED — the listing is incomplete, treat it as unread"); sys.exit(1)
for e in d.get("tree",[]):
    kind = "dir " if e["type"]=="tree" else "file"
    print("  %-4s %-34s %s" % (kind, e["path"], e["sha"] if e["type"]=="blob" else ""))
'
echo

# 3. The guard, at the ROOT-relative path the build command fetches.
echo "3 guard blob, as the tree reports it"
api_blob=$(printf '%s' "$tree" | python3 -c '
import json,sys
d=json.load(sys.stdin)
for e in d.get("tree",[]):
    if e["path"]=="'"$GUARD_PATH"'" and e["type"]=="blob": print(e["sha"]); break
')
if [ -z "$api_blob" ]; then
  echo "  NOT FOUND at $GUARD_PATH"
  echo "  If it appears nested under another directory, the folder itself was"
  echo "  uploaded instead of its contents, and the build command would 404."
  refuse "the guard is not at $GUARD_PATH"
fi
echo "  reported          $api_blob"
echo "  expected          $EXPECTED_GUARD"
[ "$api_blob" = "$EXPECTED_GUARD" ] || refuse "the guard blob does not match the pinned artifact"
echo "  match"
echo

# 4. THE DECISIVE READ. Fetch the content out of the private repository and hash
#    it here, so the identity does not rest on the API's own claim.
echo "4 guard content, read from the private repository and hashed locally"
raw=$(get "https://api.github.com/repos/$OWNER/$REPO/contents/$GUARD_PATH")
tmp=$(mktemp) || refuse "could not create a temporary file"
printf '%s' "$raw" | python3 -c '
import base64,json,sys
d=json.load(sys.stdin)
if "content" not in d:
    sys.stderr.write("no content field: %s\n" % d.get("message","")); sys.exit(1)
sys.stdout.buffer.write(base64.b64decode(d["content"]))
' > "$tmp" || { rm -f "$tmp"; refuse "could not read the guard content"; }
local_blob=$(git hash-object "$tmp")
bytes=$(wc -c < "$tmp" | tr -d ' ')
echo "  bytes read        $bytes"
echo "  hashed here       $local_blob"
if [ "$local_blob" = "$EXPECTED_GUARD" ]; then
  echo "  match — content access works, and the file survived byte-for-byte"
else
  rm -f "$tmp"; refuse "content hashes to $local_blob, not $EXPECTED_GUARD"
fi
head -3 "$tmp" | sed 's/^/  | /'
rm -f "$tmp"
tok=''
