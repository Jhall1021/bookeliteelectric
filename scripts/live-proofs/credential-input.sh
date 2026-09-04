#!/bin/sh
#
# Hidden-input credential helper. THE OPERATOR RUNS THIS, NOT THE AGENT.
#
#   sh scripts/live-proofs/credential-input.sh vercel
#   sh scripts/live-proofs/credential-input.sh github
#
# The value is typed at a prompt with terminal echo OFF and goes straight to a
# file. It is never an argument (argv is world-readable through ps), never
# echoed, never printed, and never written to a log or shell history. Nothing
# here sends anything anywhere.
#
# What it prints back is a LENGTH and a short fingerprint, so a mistyped or
# truncated paste is caught without the value being displayed.
set -eu

DIR="$HOME/.p2b-live-proofs"
case "${1:-}" in
  vercel) FILE="$DIR/vercel-token"; WHAT="Vercel token, scoped to the DISPOSABLE project only" ;;
  github) FILE="$DIR/github-token"; WHAT="GitHub token, scoped to the DISPOSABLE repo only" ;;
  *) echo "usage: sh $0 vercel|github" >&2; exit 2 ;;
esac

umask 077
mkdir -p "$DIR"

printf '%s\n' "$WHAT"
printf 'It will not be shown as you type. Press Return when done.\n'
printf 'value: '

# Echo off around the read, restored even on interrupt.
saved=$(stty -g)
trap 'stty "$saved" 2>/dev/null; printf "\n"; exit 130' INT TERM
stty -echo
IFS= read -r value
stty "$saved"
trap - INT TERM
printf '\n'

[ -n "$value" ] || { echo "refusing: empty value, nothing written" >&2; exit 1; }

# Written by redirection under umask 077 — the value never appears in argv.
printf '%s' "$value" > "$FILE"
chmod 600 "$FILE"

len=$(printf '%s' "$value" | wc -c | tr -d ' ')
fp=$(printf '%s' "$value" | shasum -a 256 | cut -c1-8)
value=''

printf '\nstored %s\n' "$FILE"
printf '  length %s, fingerprint %s\n' "$len" "$fp"
printf '  permissions: %s\n' "$(ls -l "$FILE" | cut -d' ' -f1)"
printf '\nKeep this directory out of backups. Revoke the token when the proofs are done.\n'
