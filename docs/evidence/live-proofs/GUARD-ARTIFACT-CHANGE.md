# The guard artifact changed — the live proofs describe the prior one

**The provenance guard was modified on 5 September 2026 to close review finding
4. Its hash therefore changed, and the live proofs no longer describe the
artifact in the tree.**

| | |
|---|---|
| Artifact the live proofs exercised | `2e6e4b289b57a49579cef88ee1f7bfffc5786bf8` |
| Artifact after the round-3 bootstrap fix | `a6e1c7dd20649103de2a4150db04946457b1cafb` |
| Artifact now in the tree | `fb26e46b33b1310aad8ccfe1ad68e3d6ce0e6c1c` |

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

## Third revision, 5 September 2026: non-production builds pass through

The guard refused every build whose target was not production. On a project
carrying this Build Command that meant **every Preview failed, permanently** —
which is not a security guarantee. A preview cannot become production by
building, and the production branch of this same guard is the actual boundary.
What the refusal actually bought was a red check that hides real regressions
behind a failure everyone learns to ignore.

A recognized non-production target (`preview`, `development`) now prints an
explicit pass-through and exits 0, letting the ordinary build run. **Production
enforcement is unchanged**, and an absent, empty or unrecognized `VERCEL_ENV` is
still refused as `NOT_PRODUCTION` — "not production" is a claim, and a build that
cannot say what it is has not made it.

This also breaks a circular release sequence: the previous behavior meant the
guard could only ever be live-tested by a production build from `main`, which
only exists after the merge that the test was supposed to inform. A Preview build
now exercises the bootstrap end to end — `shasum` present, guard fetched, digest
matched, guard executed — and then RETURNS SUCCESSFULLY, so the bootstrap carries
on into `npm run build` exactly as it would in production. The build may still
fail afterwards for unrelated reasons; on the canonical project it is expected to,
at `verify-database-identity`, because that project has no safe Preview
`DATABASE_URL`. That failure is downstream of the guard and says nothing about it.

`decideBuildProvenance` is deliberately NOT changed: it answers whether a
*deployment* may be promoted, and a preview may never be. The verifier's fact
table records that divergence explicitly rather than dropping the case.

## What this means for the proofs

**Proofs 4 and 6 exercised `2e6e4b28…`, which is now two revisions behind.** Their
evidence is unchanged and remains accurate about the artifact they tested. They
are **not** evidence about the current guard.

## Status of the current guard: OFFLINE-TESTED, NOT LIVE-PROVEN

`fb26e46b33b1310aad8ccfe1ad68e3d6ce0e6c1c` is **offline-tested**: the
credential-free suites exercise it — refusal codes, ordering, the production
endpoint pin, the credential-shape check, and the environment gate in all three
of its states — and it is covered by the mutation sweep and the typecheck.

It is **not live-proven**. No deployment has ever been built with it, and the
same is true of `a6e1c7dd…`, which this supersedes. Proof 4 and proof 6 ran
against `2e6e4b28…` and **nothing in this repository establishes that
`fb26e46b…` behaves the same way inside a real Vercel build.** The disposable
infrastructure that produced those proofs has been deleted.

**A Preview build on the canonical project is now the intended live test**, and
the pass-through is what makes it possible: it exercises the bootstrap end to end
— `shasum` present, guard fetched, digest matched, guard executed — and then hands
control on to `npm run build`. That is a real test of everything except the
production enforcement branch, which only a `main` production build can exercise.

Do not cite proofs 4 or 6 as evidence for the current artifact. They are
evidence for the prior one, and the two are different files.

## Evidence integrity

Every existing evidence file is unchanged, byte for byte. This note is an
addition. `docs/design/live-proofs-plan.md` and
`scripts/live-proofs/make-test-guard.sh` still pin `2e6e4b28…`, correctly —
they describe the proofs as they were run.
