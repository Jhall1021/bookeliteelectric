# Deferred documentation debt

## The guard's "PRIVATE REPOSITORY" comment is inaccurate

`scripts/provenance-guard.sh:20` reads:

    # PRIVATE REPOSITORY: the fresh-main read is authenticated.

`Jhall1021/bookeliteelectric` is **public** — established 4 September 2026 by an
unauthenticated read that returned `"private": false`. `_releaseProvenance.ts`
already says so correctly beside `gitRemote`. The two statements contradict each
other and the guard's is the wrong one.

**Deliberately NOT corrected, and the reason is the point.** The guard is the
artifact the live proofs exercised, pinned at blob
`2e6e4b289b57a49579cef88ee1f7bfffc5786bf8`. Every proof-4 and proof-6 identity
claim rests on the deployed guard hashing to that value. Editing a comment
changes the blob, and every one of those claims would then be about an artifact
that no longer exists.

**Nothing behavioural is affected.** The guard authenticates its fresh-`main`
read, and authenticating a read of a public repository is correct — it costs
nothing, avoids unauthenticated rate limits, and the `NO_READ_CREDENTIAL`
refusal that goes with it stays sound. The comment misdescribes *why*, not
*what*.

**When to fix it:** the next time the guard is changed for a behavioural reason
and re-pinned. Correcting the comment alone would spend the pin for nothing.

Do **not** use this as grounds to remove authentication from the guard: the
refusal is load-bearing, and "the repo is public" is not a reason to read it
anonymously from inside a build.

## The test fixture id

`scripts/verify-release-control.ts` uses `REPO_ID = 1357038688` — the
origin-trust probe's real id — as a synthetic fixture. It is now commented as
deliberately **not** the canonical value, so the tests cannot pass by
accidentally agreeing with the real constant. The number is left alone: changing
a fixture to tidy it risks masking what it pins.
