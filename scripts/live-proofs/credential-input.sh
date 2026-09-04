#!/bin/sh
#
# Hidden-input credential helper. THE OPERATOR RUNS THIS, NOT THE AGENT.
#
#   sh scripts/live-proofs/credential-input.sh vercel
#   sh scripts/live-proofs/credential-input.sh github
#
# The value is typed at a prompt with terminal echo OFF and goes straight to a
# file that already has its permissions. It is never an argument (argv is
# world-readable through ps), never echoed, never printed, never logged.
#
# FOUR THINGS THE FIRST VERSION GOT WRONG:
#
#   1. It followed symlinks. A symlinked directory or token file would have
#      written the secret wherever the link pointed. Both are refused now.
#   2. It overwrote an existing token file, destroying a value already in use
#      with no warning. An existing file is refused; remove it deliberately.
#   3. It set the file mode AFTER writing, so the secret existed at the default
#      mode first. The file is created and chmod'd BEFORE the prompt, and the
#      mode is verified before anything is read.
#   4. Terminal echo could stay off if input ended unexpectedly. EOF and every
#      signal now restore the saved terminal settings.
#
# P2B_LIVE_PROOFS_DIR redirects the directory; it exists so these behaviours can
# be tested with fake values, and is not used in normal operation.
set -u

DIR="${P2B_LIVE_PROOFS_DIR:-$HOME/.p2b-live-proofs}"
case "${1:-}" in
  vercel) FILE="$DIR/vercel-token"; WHAT="Vercel token, scoped to the DISPOSABLE project only" ;;
  github) FILE="$DIR/github-token"; WHAT="GitHub token, scoped to the DISPOSABLE repo only" ;;
  *) echo "usage: sh $0 vercel|github" >&2; exit 2 ;;
esac

refuse() { echo "REFUSING: $*" >&2; exit 1; }

mode_of() {   # 0700-style mode, portably
  stat -f '%Lp' "$1" 2>/dev/null || stat -c '%a' "$1" 2>/dev/null
}

# --- the directory, before anything else ------------------------------------
[ -L "$DIR" ] && refuse "$DIR is a symlink; the value would be written through it"
if [ -e "$DIR" ]; then
  [ -d "$DIR" ] || refuse "$DIR exists and is not a directory"
else
  mkdir -p "$DIR" || refuse "could not create $DIR"
fi
chmod 700 "$DIR" || refuse "could not set mode 0700 on $DIR"
dm=$(mode_of "$DIR")
[ "$dm" = "700" ] || refuse "$DIR is mode $dm, not 700"

# --- the file, created and secured BEFORE the prompt -------------------------
[ -L "$FILE" ] && refuse "$FILE is a symlink; the value would be written through it"
[ -e "$FILE" ] && refuse "$FILE already exists.
A token may already be in use. Remove it deliberately before storing another:
  rm $FILE"

umask 077
: > "$FILE" || refuse "could not create $FILE"
chmod 600 "$FILE" || refuse "could not set mode 0600 on $FILE"
fm=$(mode_of "$FILE")
[ "$fm" = "600" ] || { rm -f "$FILE"; refuse "$FILE is mode $fm, not 600"; }

# From here on, a failure must not leave an empty file to block the next run.
discard() { [ -s "$FILE" ] || rm -f "$FILE"; }

# --- terminal handling -------------------------------------------------------
[ -t 0 ] || { discard; refuse "stdin is not a terminal.
This reads from a terminal on purpose: a piped or redirected value would come
from a file or shell history, which is what this helper exists to avoid."; }

saved=$(stty -g 2>/dev/null) || { discard; refuse "could not read terminal settings"; }
restore() { [ -n "${saved:-}" ] && stty "$saved" 2>/dev/null; }
# EXIT covers normal returns, refusals and EOF; the signals cover interruption.
trap 'restore; discard' EXIT
trap 'restore; discard; printf "\n"; exit 130' INT TERM HUP

# ECHO OFF BEFORE THE PROMPT, not after it. Printing "value: " first leaves a
# window in which the terminal is still echoing, and a value pasted the instant
# the prompt appears is displayed — which a pty test caught doing exactly that.
stty -echo

printf '%s\n' "$WHAT"
printf 'prepared %s (mode %s) in %s (mode %s)\n' "$FILE" "$fm" "$DIR" "$dm"
printf 'It will not be shown as you type. Press Return when done.\n'
printf 'value: '

if IFS= read -r value; then
  read_ok=1
else
  read_ok=0            # EOF, or the terminal went away mid-read
fi
restore
printf '\n'

[ "$read_ok" = "1" ] || { discard; refuse "input ended without a value; nothing was written"; }
[ -n "$value" ] || { discard; refuse "empty value; nothing was written"; }

# Written by redirection into the already-secured file — never through argv.
printf '%s' "$value" > "$FILE" || { discard; refuse "could not write $FILE"; }

len=$(printf '%s' "$value" | wc -c | tr -d ' ')
fp=$(printf '%s' "$value" | shasum -a 256 | cut -c1-8)
value=''
unset value

printf '\nstored %s\n' "$FILE"
printf '  length %s, fingerprint %s\n' "$len" "$fp"
printf '  file %s, directory %s\n' "$(mode_of "$FILE")" "$(mode_of "$DIR")"
printf '\nKeep this directory out of backups. Revoke the token when the proofs are done.\n'
