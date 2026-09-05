# Proof 4 — proposed procedure

**Planning only. Nothing here runs until approved.**

Does the provenance guard execute on an **API-created** deployment — the path
Phase B actually uses — and does it both **pass** a legitimate build and
**refuse** an illegitimate one? Every observation so far is of git-triggered or
import-created builds.

Two deployments, one creation request each, positive first.

## Why production target, and the one risk I cannot retire

Both cases must be `target: "production"`. Proof 5 established that a `staging`
deployment does **not** receive Production-only variables: `P2B_GH_HDR` was
absent, the guard download 404'd, and the guard never ran. A case where the
guard cannot run cannot answer a question about what the guard decides.

**The risk: an API-created production deployment may take the aliases.** Proof 1
showed a *git* production deployment moving two of the three `*.vercel.app`
aliases, and `autoAssignCustomDomains: false` did not prevent it — that setting
governs *custom* domains, and these are Vercel-generated.

Whether **API** creation does the same is **unknown**. There is a reason to
expect it does not: the release's Phase C promotes as a separate step, which
would be pointless if creation promoted by itself. But that is an inference from
our own design, not an observation of Vercel, and I will not present it as more.

So: the positive case is the experiment that settles it, snapshots bracket it,
and any alias movement **stops the sequence before the negative case**.

One mitigating fact, stated so the risk is judged accurately rather than feared:
the positive case is pinned to `24a5583…`, the **same commit the current
production deployment already serves**. If its aliases did move, they would move
to a deployment of byte-identical content. The change would be in which
deployment id serves the hosts, not in what is served.

## Common to both cases

Request shape, redacted — identical to proof 5 except `target`:

    POST https://api.vercel.com/v13/deployments
    Authorization: Bearer <REDACTED — vcp_ project-scoped, fingerprint babd0443>
    Content-Type: application/json

    {
      "name": "p2b-release-proofs",
      "project": "prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q",
      "target": "production",
      "gitSource": {
        "type": "github",
        "repoId": 1357368650,
        "ref": "main",
        "sha": "<the case's pinned sha>"
      }
    }

No `projectSettings`, no `files`, no `teamId`. Nothing is promoted, no alias
call is made, no project setting or environment variable is touched, the
repository is not modified, and no canonical resource is addressed.

Before each creation: isolation check, `capture-state.sh`, and confirm GitHub
`main` is still `24a5583…` and the guard blob at `main` is still `9d9139d2…`.
The request is written to evidence **before** it is sent.

## Case 1 — positive: the guard runs and passes

| | |
|---|---|
| Pinned sha | `24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d` (current `main`) |
| Expected `VERCEL_ENV` | `production` |
| Expected `VERCEL_GIT_PROVIDER` | `github` |
| Expected `VERCEL_GIT_REPO_OWNER` | `Price2Book` |
| Expected `VERCEL_GIT_REPO_SLUG` | `p2b-release-proofs` |
| Expected `VERCEL_GIT_COMMIT_REF` | `main` |
| Expected `VERCEL_GIT_COMMIT_SHA` | `24a5583…` |

Expected evidence, in order:

1. `PROVENANCE OK 24a55837…` — the guard ran and passed
2. `P2B-APP-BUILD-RAN` **after** it, at a strictly greater log index
3. `readyState: READY`, `target: production`

**Only this case can establish the positive half.** A refusal here would not
substitute for it.

## Case 2 — negative: the guard runs and refuses

| | |
|---|---|
| Pinned sha | `afa291520b5b8173c3d933d732f2bd67dbd7d0ac` (the root commit — a real commit on `main`'s history, still on the ref) |
| Expected `VERCEL_GIT_COMMIT_SHA` | `afa2915…` |
| Everything else | as case 1 |

The guard downloads from `?ref=main`, so it reads the head (`24a5583…`) and
compares it against the deployed commit (`afa2915…`). They differ, so:

1. `PROVENANCE REFUSED (SHA_NOT_MAIN): commit afa2915… is not GitHub main 24a5583…`
2. `P2B-APP-BUILD-RAN` **absent** — the marker exists precisely so its absence is observable
3. Final state **not** `READY` (expect `ERROR`)

Every earlier guard check must pass before `SHA_NOT_MAIN` is reachable —
production target, github provider, owner, repo, ref, a full sha, and a read
credential — so this refusal also evidences that those seven inputs were correct
on an API-created deployment.

## Guard-artifact identity, and its limit

Evidence that the **identified** guard ran, from three converging facts:

- the blob at `main` is `9d9139d2…`, checked immediately before and after each case
- the effective `buildCommand` on the deployment names exactly
  `Price2Book/p2b-release-proofs` … `scripts/provenance-guard.sh?ref=main`
- the emitted strings (`PROVENANCE OK`, `PROVENANCE REFUSED (SHA_NOT_MAIN)`)
  match the pinned artifact's text

**The limit, stated plainly:** this is convergence, not a digest. The running
guard does not print its own hash, so nothing in the log proves the executed
bytes. Making it print one would require modifying the repository, which this
authorization excludes. If stronger identity evidence is wanted, that is a
separate change to authorize — not something to quietly assume.

## Stopping conditions

Stop, report, and do not remediate:

- **Any alias mapping differs** from the before-snapshot → stop **before case 2**
- **The production target changes** unexpectedly → stop
- **No unambiguous deployment id** in a creation response → **UNCERTAIN**; no retry, and no searching listings to choose one
- **Case 1 does not reach READY** → stop; do not proceed to case 2
- **Guard blob at `main` ≠ `9d9139d2…`** at any check → stop
- **Case 2 reaches READY, or prints `P2B-APP-BUILD-RAN`** → a finding that the guard did not stop it → stop and report
- **Case 2 refuses with a code other than `SHA_NOT_MAIN`** → report the code as observed; no retry, no reconfiguration
- **Either case fails before the guard downloads** (as proof 5's staging build did) → that is not a guard result; stop and report

One creation request per case. No retries under any circumstance. Two
deployments total, both left in place for evidence.

## What this will and will not settle

Settles: whether the guard runs on an API-created deployment, and whether it
both admits a legitimate build and refuses an illegitimate one on that path.

Does not settle: proof 2 (config-file override), proof 3 (historical settings),
or proof 6 (promotion and aliases). If case 1's aliases move, that is
information relevant to proof 6 — but it will be recorded as an observation of
*creation*, never as an answer about *promotion*.
