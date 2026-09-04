# The six live proofs — plan

Status: **planning only.** Running any of this needs explicit authorization and
fresh scoped credentials. Production, pushes, merges and cutover stay on hold.

The offline suite (160 checks) establishes that the release *code* decides
correctly given facts. It cannot establish what Vercel actually does. Six
questions remain, and the suite prints them on every run so they cannot be
quietly forgotten. Each one below names the line of code that would be wrong if
the answer came back the other way.

## Why these six and not others

The origin-trust investigation refuted attestation: a project-scoped token
produced a deployment record indistinguishable from a genuine git push, and
Vercel *enriched* the forgery with `githubCommitAuthorLogin` and
`githubRepoVisibility`. The release therefore trusts only causation — it creates
the deployment and keeps the id from its own request.

That pivot leaves exactly six load-bearing assumptions about platform behaviour
that no fake can settle. They are not a survey of Vercel; they are the residue.

## Which guard is under test

**The reviewed guard is not on any remote.** The reviewed branches are unpushed,
so the canonical build command — which fetches
`scripts/provenance-guard.sh` from `Jhall1021/bookeliteelectric` at `main` —
would fetch *whatever that remote carries*, which is not the reviewed file.
Fetching remote `main` therefore does not establish that the reviewed guard ran,
and no result may be reported as if it had. No production-repository push is
implied or required by this plan.

**The tested guard is necessarily a modified copy.** The guard hard-codes

    OWNER=Jhall1021   REPO=bookeliteelectric   REF=main

and compares them against `VERCEL_GIT_REPO_OWNER`, `VERCEL_GIT_REPO_SLUG` and
`VERCEL_GIT_COMMIT_REF`. On a disposable repository those environment values
carry the disposable identity, so an unmodified guard refuses `WRONG_OWNER` /
`WRONG_REPO` / `WRONG_REF` before reaching anything the proofs are about. The
substitutions are therefore part of the experiment, not an accident of it.

Recorded before the first proof runs, and carried on every result:

| Recorded | Why |
|---|---|
| Reviewed guard blob hash — `2e6e4b289b57a49579cef88ee1f7bfffc5786bf8` | the artifact the review covered |
| Test guard blob hash | the artifact that actually ran |
| Exact diff between them | expected: the three constants, nothing else |
| Repo, ref and commit the test guard is served from | what `guardUrl` resolved to |
| `P2B_MAIN_API`, if set | which repository the fresh-main read actually hit |

A diff that touches anything beyond those constants invalidates the run: the
proofs are about the reviewed guard's behaviour, not a variant's.

## Credentials

Two environment inputs, both required, easy to mistake for one:

| Input | Read by | For |
|---|---|---|
| `P2B_GH_HDR` | the build command | **downloading** the guard script |
| `P2B_GH_READ_TOKEN` | the guard itself | the **fresh-main lookup** |

The guard refuses `NO_READ_CREDENTIAL` outright if the second is absent, so a
run configured with only `P2B_GH_HDR` proves nothing about provenance. These are
two inputs, not necessarily two tokens — one appropriately scoped GitHub token
can supply both.

**Scope is set by the repository the guard CHECKS, not the one it downloads
from.** The fresh-main read goes to
`api.github.com/repos/$OWNER/$REPO/git/ref/heads/$REF`, overridable by
`P2B_MAIN_API`. Where those differ from the download location, the token must
cover both, and the plan records which repository each input reached.

Credential handling is unchanged from the origin-trust test: a local
hidden-input helper the operator runs in their own Terminal, values written to a
file outside any backup, never in chat, argv, shell history or logs. Revoked at
the end.

## Resources

All disposable, all created fresh rather than reused from the origin-trust probe:
one private GitHub repo (synthetic app plus the test guard at a known ref), one
Vercel project (build command set to the provenance one-liner), and the scoped
GitHub token above. Deleted and revoked when the proofs are done.

## How results are treated

**A surprising result is evidence, not a decision.** Each proof below records a
finding. Changing the release mechanism is a separate decision, taken
afterwards, with the evidence in hand. In particular:

- **A guard refusal is not proof the guard is wrong.** The guard prints
  `PROVENANCE REFUSED (<CODE>)` and exits non-zero, so a refusal *line in the
  build log is itself proof the guard executed* — which is what proof 4 asks.
  `NOT_PRODUCTION`, `NOT_GITHUB`, `WRONG_OWNER`, `WRONG_REPO`, `WRONG_REF`,
  `NO_SHA` and `NO_READ_CREDENTIAL` all indicate **missing or mismatched
  configuration**, and API-created deployments are already known to carry empty
  `VERCEL_GIT_*` in the CLI case — which would produce exactly these codes. That
  is a configuration finding to diagnose, not a verdict on the design.
- **Aliases that do not move are an already-handled outcome.** `verifyHosts`
  records `alias points at X, expected Y`, `complete` is false, and the run
  returns `INCOMPLETE` holding its lock. That is the designed behaviour. It does
  **not** authorize adding alias mutation to Phase C.
- **A successful git baseline does not undo the forgery evidence.** Proof 1
  establishes a reference record. It cannot un-demonstrate that metadata was
  forgeable, and causation remains the basis regardless of how proof 1 reads.

## The proofs

### 1 — A successful git-triggered build

*Depends on it:* everything downstream. The forgery evidence was gathered on
records that never completed a successful production build, so there is no
reference for what a genuine one looks like.

Push a commit to the disposable repo, let Vercel build it from the git
integration, capture the whole deployment record. This is the control against
which 3 and 6 are read, and it must come first.

*Finding if it differs from the probe's records:* the field-level conclusions in
the origin-trust observation are narrower than stated and get re-scoped. The
forgery itself stands either way.

### 2 — The config-file override

*Depends on it:* `preflightDecision`'s `CONFIG_FILE_PRESENT` refusal
(`scripts/_releaseControl.ts`), which refuses any commit whose tree contains
`vercel.json`, `vercel.toml` or `vercel.ts` on the stated grounds that such a
file *"overrides the project settings"*.

Commit a `vercel.json` carrying a `buildCommand` that writes a marker, deploy it,
read the build log: did the dashboard command run, or the file's?

*This is the decisive one.* If a repo file overrides the dashboard build command,
the provenance guard — which lives in the dashboard command precisely because an
old checkout cannot bypass it — is bypassable by any commit adding a config file,
and the refusal above is load-bearing rather than cautious. If it does not
override, the refusal is conservative and gets documented as such. The current
code assumes the dangerous answer, which is the right way round to be wrong.

### 3 — Immutability on a successful build

*Depends on it:* the release keeping the id from its own creation request and
reading the candidate back later. If a record can be mutated after a successful
build, "read it back" stops being a check.

Take the proof-1 deployment and attempt to change its record — re-POST the same
id, patch the fields the probe showed were accepted at creation.

*Finding if it is mutable:* the receipt binding (runId ↔ candidate ↔ sha ↔
outgoing baseline) binds something the platform can rewrite, and what it should
bind instead becomes a design question to answer separately.

### 4 — The guard runs on an API-created deployment

*Depends on it:* `decideBuildProvenance` being reached at all. The guard is
mirrored into the build command *because* the dashboard Build Command is what an
old checkout cannot bypass — but every observation so far is of git-triggered
builds, and Phase B creates through the API.

Create a deployment through the API and read the build log. Run it twice: once
configured so the guard should accept, once so it should refuse — a guard that
never executes must not be mistaken for one that passed. The printed
`PROVENANCE REFUSED (<CODE>)` line, or its absence, is the observation.

*Finding if it does not run:* the guard would not protect the path the release
uses. Whether that is a configuration gap or a design gap is decided from the
refusal code, afterwards.

### 5 — Creation without `projectSettings` uses the approved command

*Depends on it:* the comment at `createDeployment` in
`scripts/release-production.ts` — *"NO projectSettings, so the project's approved
configuration applies rather than anything this request carries."* That is an
assumption stated as a fact.

Create without `projectSettings` and read the build log for which command ran.
Then create *with* a `projectSettings.buildCommand` and confirm the request can
override — establishing that omitting it is a real choice and not a no-op.

*Finding if omission does not mean "use the project's":* the release would need
to send approved settings explicitly and verify them on read-back.

### 6 — Whether promotion moves the primary alias

*Depends on it:* `verifyHosts` and the three-state `AliasMapping`. The isolated
test showed the primary alias did **not** follow a promotion — one observation,
on a project whose alias configuration did not resemble canonical.

Configure aliases like canonical (apex, www, app), promote, read the alias
listing back.

*Finding if the primary alias does not move:* promotion alone does not complete a
release. The run already reports this correctly as `INCOMPLETE`; what, if
anything, Phase C should do about it is a separate decision.

## Order

1 → 5 → 4 → 2 → 3 → 6. Proof 1 is the control. 5 and 4 share a project
configuration and run together. 2 is decisive and is scheduled once the
build-command picture is settled, so its result is unambiguous. 3 and 6 both
consume the proof-1 deployment and come last.

Each proof is captured before the next begins: request, response, build log,
alias listing, guard hashes, redacted the same way the origin-trust evidence was.
A proof that cannot be captured did not happen.

## Preconditions and separate tasks

- **`CANONICAL.repoId` is `0`** (`scripts/_releaseProvenance.ts`), marked PENDING
  in its own comment. `gitSource` identifies a repository by numeric id, and the
  release verifies GitHub's value against the project link, so the comparison
  currently runs against zero. Reading the id is an unauthenticated GET against a
  public repository and needs no credential. **Reading the id and changing the
  pinned constant are two separate actions**, separately authorized; this plan
  requires neither.

## Offline status

Completed, credential-free, on the full checkout at `2ace9e5`:

| Check | Result |
|---|---|
| `tsc --noEmit`, whole checkout | **exit 0**, zero errors |
| Release control suite | 160 passed, 0 failed |
| Mutation sweep | 8/8 detected, both baselines clean, exit 0 |

Two limits on that, stated rather than glossed:

- Dependencies come from the shared `node_modules` this worktree symlinks, not a
  clean install. The typecheck is full-checkout; the dependency tree is inherited.
- `next lint` is **not configured** in this checkout — it prompts interactively to
  set ESLint up and exits non-zero. There is no lint suite to run today, and
  creating one is not part of this work.

The remaining `verify:*` scripts drive the database and need credentials, so they
are out of scope here.

## Out of scope

Production, the canonical project, pushes, merges, repository transfer, the
release pause and cutover. No canonical credential is used at any point; nothing
here touches `prj_zB0QVq80340s2dVt7X3c1ewKgHtT`.
