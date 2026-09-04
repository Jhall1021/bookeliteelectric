# Proof 2 — proposed procedure

**Planning only. No branch, file, deployment or setting change is authorized.**

Does a root-level `vercel.json` override the project's dashboard build command?
If it does, the provenance guard — which lives in that dashboard command
precisely because an old checkout cannot carry it away — is bypassable by any
commit that adds a config file, and `preflightDecision`'s `CONFIG_FILE_PRESENT`
refusal is load-bearing rather than merely cautious.

## Why a Preview deployment is sufficient

The branch push produces a Preview deployment and **that alone answers the
mechanism question**, because Preview creates a clean asymmetry:

`P2B_GH_HDR` and `P2B_GH_READ_TOKEN` are **Production-only** and are not being
broadened. So a Preview build that runs the *dashboard* command cannot fetch the
guard at all — exactly what proof 5's staging build demonstrated: an empty
Authorization header, a 404 on a private repository's contents, and `curl -f`
stopping the chain.

| If the config file… | The build does | Observable |
|---|---|---|
| **overrides** | runs the file's command | `P2B-PROOF2-OVERRIDE-RAN`, then `P2B-APP-BUILD-RAN`, **READY** |
| **does not override** | runs the dashboard command | `curl: (22) … 404`, no marker, **ERROR** |

Two outcomes that cannot be confused for one another, neither of which needs a
production credential.

**No API deployment is proposed.** One would add nothing the Preview record does
not already carry, and a production-targeted one would be actively worse: if the
override works, that deployment would reach READY, and in this project's
observed cases a READY production deployment is when the two generated aliases
moved.

**The limitation, stated rather than buried:** this observes the override on a
**Preview** target. The concern is a *production* deployment carrying the file.
Nothing about the config-file mechanism is obviously target-dependent, but the
observation is Preview and the inference to production is an inference. If a
production-targeted confirmation is wanted, it is a separate authorization with
the alias risk above attached — I am not proposing it as part of this.

## The change

One new file, on a new branch. `main` is untouched, and `package.json`,
`src/build.mjs` and `scripts/provenance-guard.sh` are untouched.

**Branch:** `with-override`, created from the current `main`
(`24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d`).

**File:** `vercel.json` at the repository root, exactly:

```json
{
  "buildCommand": "echo P2B-PROOF2-OVERRIDE-RAN && npm run build"
}
```

Only `buildCommand` is set. `outputDirectory` and the rest are deliberately left
to the project so that exactly one variable changes. The command is harmless: it
prints a marker no other step prints, then runs the existing application build,
and it never invokes the provenance guard.

`P2B-PROOF2-OVERRIDE-RAN` appears nowhere in the repository, the dashboard
command, or the guard — so its presence has exactly one explanation.

## The GitHub web steps (the token is read-only; these are yours)

1. `Price2Book/p2b-release-proofs` → the **branch dropdown** (reads `main`)
2. Type `with-override` → **Create branch: with-override from main**
3. With `with-override` selected: **Add file → Create new file**
4. Filename: `vercel.json` — at the repository **root**, no directory prefix
5. Paste the JSON above, exactly
6. Commit message: `Proof 2: repository build-command override`
7. Commit **directly to `with-override`** — *not* to `main`, and **not** a pull
   request

Vercel will create a Preview deployment for the branch on its own.

## Evidence to capture

**Before** — `capture-state.sh`, plus:

- the project's dashboard `buildCommand`, recorded as **unchanged** (it is the
  control; if the file overrides, it overrides *this*)
- `main` still `24a5583…`, guard blob still `9d9139d2…`
- production target and all three aliases

**The branch** — its commit sha, its parent (must be `24a5583…`), and its tree:
`vercel.json` present, and `package.json`, `src/build.mjs`,
`scripts/provenance-guard.sh` byte-identical to `main`'s (same blob hashes).

**The deployment** — id, `target` (expected `preview`), the effective build
command on the record, ordered build logs, final state.

**After** — `capture-state.sh` again: production target and the three aliases.

## What proves the override

**Proof of override**, all of which must hold together:

1. `P2B-PROOF2-OVERRIDE-RAN` appears in the build log
2. `P2B-APP-BUILD-RAN` appears **after** it
3. **No** `PROVENANCE OK` and **no** `PROVENANCE REFUSED` anywhere — the guard
   did not run, which is the point: the file replaced the command that fetches it
4. no `curl: (22)` guard-download failure
5. the deployment reaches READY

Points 3 and 5 together are what make it a *bypass* rather than merely a
different command: the build succeeded **and** the guard never executed.

**Proof of no override:** the override marker is absent, and the log instead
shows the dashboard command failing to fetch the guard (`curl: (22) … 404`),
ending in ERROR. Then the `CONFIG_FILE_PRESENT` refusal is conservative rather
than load-bearing, and that is worth knowing too.

**Anything else** — marker present *and* guard output present, marker absent with
a different failure, READY with neither marker — is **unestablished**. Report as
observed; do not reason toward one of the two clean outcomes.

## How the release already prevents this bypass

`preflightDecision` in `scripts/_releaseControl.ts`, before any deployment is
created:

```
const present = CONFIG_FILENAMES.filter((n) => tree.paths.includes(n));
if (present.length > 0)
  return { ok: false, code: "CONFIG_FILE_PRESENT",
    detail: `the built commit carries ${present.join(", ")}, which overrides the project settings` };
```

with `CONFIG_FILENAMES = ["vercel.json", "vercel.toml", "vercel.ts"]`.

Three properties matter:

- it inspects **the tree of the commit being released**, not the working copy,
  so a file added on `main` is caught wherever it came from;
- it runs in **preflight, phase A**, before anything is created — a commit
  carrying an override never reaches Phase B at all;
- the immediately preceding check refuses `TREE_TRUNCATED`, so a tree listing
  that *could not* establish absence is not read as absence. Without that, a
  truncated response would silently mean "no config file".

If Proof 2 shows the file overrides, that refusal is the only thing standing
between an override commit and a guard-free production build, and it should be
recorded as load-bearing. If it shows no override, the refusal stays as
defence-in-depth.

## Stopping conditions

Stop, report, no remediation:

- the **production target** changes
- any of the **three existing aliases** changes
  *(a NEW preview alias for the branch appearing is expected and is not a
  stopping condition — an addition is not a movement; the three existing hosts
  and the target are what must hold)*
- `main` moves, or the guard blob at `main` is no longer `9d9139d2…`
- the branch carries anything other than the single added `vercel.json`
- the deployment's target is not `preview`
- no unambiguous deployment id → UNCERTAIN; no retry, no listing search
- the log shows both the override marker and guard output
- the deployment reaches READY with neither marker

## Cleanup boundaries

Nothing is cleaned up as part of this. The branch, its commit and its deployment
stay in place as evidence.

**The branch is never merged into `main`.** If it were, `main` would carry
`vercel.json`, and every future proof against `main` would run under an override
— and the release's own preflight would refuse `main` outright.

Deleting the branch or the deployment afterwards is a separate authorization, as
is any teardown of the disposable project.
