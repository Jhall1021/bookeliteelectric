# The guard artifact changed — the live proofs describe the prior one

**The provenance guard was modified on 5 September 2026 to close review finding
4. Its hash therefore changed, and the live proofs no longer describe the
artifact in the tree.**

| | |
|---|---|
| Artifact the live proofs exercised | `2e6e4b289b57a49579cef88ee1f7bfffc5786bf8` |
| Artifact now in the tree | `a6e1c7dd20649103de2a4150db04946457b1cafb` |

## What changed, and why the hash was allowed to move

*(The guard was revised twice on 5 September 2026 — once for the review's
finding 4, then again after a follow-up review showed the credential check ran
too late to protect the download. Only the final hash above is in the tree.)*

Two environment variables could decide the guard's answer.

- **`P2B_GH_HDR` was a curl configuration fragment, not a header.** Its contents
  were interpolated verbatim into what curl reads with `-K`, and a curl config
  accepts `url = …` — several of them — plus `output` and `config`. So the
  variable could add a second source to a fetch whose result is piped into
  `sh`, while the Build Command still matched the approved string exactly.

  The bootstrap now sends **no credential at all** — the repository is public,
  and the guard performs its own authenticated read once it is running — and it
  pins the guard's SHA-256 digest, so the bytes that reach `sh` are verified
  before they run. There is no longer a credential to interpolate.
- **`P2B_MAIN_API` could replace the endpoint the guard validates against.** It
  is now ignored in a production build, and its mere presence there is refused
  as `OVERRIDE_IN_PRODUCTION`.
- The credential is refused if it contains whitespace or quoting characters,
  which closes the same injection path on the guard's own fetch.

Preserving a known weakness to protect an artifact hash would have been
backwards. The hash moved deliberately.

## What this means for the proofs

**Proofs 4 and 6 exercised `2e6e4b28…`, not `a6e1c7dd20649103de2a4150db04946457b1cafb`.** Their
evidence is unchanged and remains accurate about the artifact they tested. They
are **not** evidence about the current guard.

## Status of the current guard: OFFLINE-TESTED, NOT LIVE-PROVEN

`a6e1c7dd20649103de2a4150db04946457b1cafb` is **offline-tested**: the
credential-free suites exercise it — refusal codes, ordering, the production
endpoint pin, the credential-shape check — and it is covered by the mutation
sweep and the typecheck.

It is **not live-proven**. No deployment has ever been built with it. Proof 4
and proof 6 ran against `2e6e4b289b57a49579cef88ee1f7bfffc5786bf8` and
**nothing in this repository establishes that `a6e1c7dd2064…` behaves the same way
inside a real Vercel build.** Re-establishing that would require recreating the
disposable infrastructure, which has been deleted and is not authorized.

Do not cite proofs 4 or 6 as evidence for the current artifact. They are
evidence for the prior one, and the two are different files.

## Evidence integrity

Every existing evidence file is unchanged, byte for byte. This note is an
addition. `docs/design/live-proofs-plan.md` and
`scripts/live-proofs/make-test-guard.sh` still pin `2e6e4b28…`, correctly —
they describe the proofs as they were run.
