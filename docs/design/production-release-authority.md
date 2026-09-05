# Production release authority — one source, one door

**3 September 2026.** Stage 1 of the deployment-provenance workstream: the
decisions, the release command, the read-back endpoint, and the proof. Nothing
here is yet wired to the live canonical project; that is Stage 2, after review.

## The incident this answers

A CLI production deployment built from a divergent local `main` reached READY
four minutes after the approved release of shared `main` and took every
canonical domain, because Vercel assigns production domains to whichever
production deployment finishes, and nothing asked where its source came from.
Its client-supplied metadata truthfully said `main` — the wrong `main`.
`/platform` vanished from production until the approved artifact was promoted
by hand. Eight such deployments had been made from that lineage in two days;
this was the first to collide.

## The invariant

**Only a deployment that IS the current GitHub `main` of
`Jhall1021/bookeliteelectric` may become canonical Price2Book production.**
"Is" means the deployment's commit SHA equals a fresh read of
`refs/heads/main` from GitHub at the moment of decision. Not a branch name,
not a commit message, not who started first, not who finished last.

## The layers, and what each one holds against

| layer | lives in | holds against |
|---|---|---|
| Auto-assign custom production domains **off** on the canonical project (done, Stage 1A) | Vercel project setting | a READY build taking the domains by finishing |
| Build Command fetches `scripts/provenance-guard.sh` from GitHub `main` and runs it before `npm run build` (Stage 2) | Vercel project setting | an old or foreign checkout: the guard that runs is main's, not the tree's |
| `provenance-guard.sh` / `decideBuildProvenance` | this repository, but executed from main | wrong target, provider, owner, repo, ref, missing SHA, unreadable GitHub, SHA ≠ main |
| `scripts/release-production.ts` | operator's machine | promotion of anything but the candidate THIS run created and bound in a durable receipt |
| `/api/release` | the deployment | not knowing what is serving |
| no deploy credential in repository files or shared session environments | operator discipline, enforced by the release command refusing `.env` | every session on the machine being a production operator |

## Staged production builds and explicit promotion

Production builds are produced by Vercel from GitHub `main` (Stage 2 connects
the canonical project). A build reaching READY does nothing to the domains.
A person then runs:

```
npx tsx scripts/release-production.ts             # PREFLIGHT — read-only
npx tsx scripts/release-production.ts --create    # create the pinned deployment + receipt
npx tsx scripts/release-production.ts --promote   # promote the receipt-bound candidate
```

**Three phases, and the candidate is caused rather than chosen.**

`--apply` no longer exists, and the command refuses it rather than treating it
as a preflight. So does any unknown flag, both phase flags together, and a stray
positional argument.

- **preflight** (no flag) reads GitHub `main`, the commit tree, the project's
  settings and the current production baseline, decides whether a release could
  proceed, and **mutates nothing**. It refuses `CONFIG_FILE_PRESENT` if the
  commit carries `vercel.json`, `vercel.toml` or `vercel.ts`, and
  `TREE_TRUNCATED` if absence cannot be established at all.
- **`--create`** creates a deployment from a pinned, explicitly approved sha —
  no `projectSettings`, so the project's approved build configuration applies
  and the provenance guard in it runs — and writes a durable receipt binding
  runId, candidate id, sha and the outgoing baseline.
- **`--promote`** promotes **only** the candidate the receipt names, then
  re-reads the production target, every canonical alias and every canonical
  host's served identity before calling it a release.

**It does not list deployments and pick one, and it does not decide origin from
a deployment's metadata.** An origin-trust observation established that every
origin-looking field on a deployment record — `source`, `githubDeployment` *(retired — see below)*,
`githubCommitSha`, `githubCommitVerification` and the rest — is writable by the
caller that creates it. A record saying "GitHub built this" is a claim, not
evidence. The release therefore *creates* the deployment and keeps the id
returned by its own request; the promote response body is never read for
identity, having been measured at one byte.

## Rollback

`/api/release` on any canonical host names the serving deployment and SHA. If
it is wrong, the previous approved deployment id is the last `previous` in the
release log; promote it with `vercel promote <id>` or through the release
command once the correct `main` is restored. A `/platform` 404 with
`x-matched-path: /[site]` is the fingerprint of a wrong artifact.

## What the empirical run showed about Vercel

Recorded in the Stage 1 report and held by the verifier:

- A project's Build Command is limited to 256 characters. The guard therefore
  cannot be inline; it is fetched from `main` — and, because a fetched file is
  only as trustworthy as its bytes, the command pins the guard's SHA-256 digest
  and refuses to execute anything else. The bootstrap fetch sends no credential:
  the repository is public, and a credential in that command is an injection
  surface rather than a boundary.

  **THE OPERATIONAL COST: editing the guard changes its digest, so the canonical
  project's Build Command must be re-installed every time the guard changes.**
  Skipping that does not run the old guard — it fails the build. The digest is
  DERIVED from the guard file at run time rather than typed in, so the command
  and the file in a given checkout cannot drift apart. What can drift is the
  value installed on the Vercel project, and preflight refuses when the project's
  Build Command is not the one this checkout computes.
- `vercel link` rewrites `.env.local` in the linked directory with pulled
  Development values. Never link a directory whose `.env.local` matters.
- `vercel deploy --yes` in an unlinked directory creates a new project named
  after the directory. Link explicitly, and verify the link, before deploying.
- Inside a build, a CLI upload receives EMPTY `VERCEL_GIT_*` variables —
  provider, owner, repo, ref and SHA all blank — whether or not the CLI sent
  client metadata (which shows up only in the API's `meta`). Observed on four
  deployments, including one from a clean checkout of shared `main`. A
  Git-triggered build populates them, plus `githubDeployment=1` in `meta`. So
  the provider check alone refuses every CLI upload, and the release command's
  `githubDeployment` *(retired — see below)* requirement refuses the same artifacts at promotion.
- With auto-assign off, three READY production builds left the project's
  production domain unassigned (404) until one was promoted explicitly; the
  oldest was promoted and newer READY builds did not displace it. The
  team-scoped `<project>-<team>.vercel.app` alias still follows the latest
  READY build; it is not a canonical host and sits behind deployment protection.

## Not in Stage 1

Connecting the canonical project to GitHub, changing its Build Command,
branch protection, the legacy project's disposition, a Preview database, and
any promotion. Each waits for review of this stage.


## Retired: the metadata-origin requirement

Earlier revisions required a candidate to carry `githubDeployment` and matching
`githubOrg`/`githubRepo`/`githubRef` metadata. **That requirement is gone**, and
so is the code behind it. The origin-trust observation established that a caller
creating a deployment writes every one of those fields, and that Vercel enriches
the forgery further — so the requirement tested a claim, not a fact.

The release now creates the deployment and keeps the id its own request
returned. References to the old requirement above are retained for history and
are **not** current operating instructions.
