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

| Resource | Purpose | Disposal |
|---|---|---|
| One private GitHub repo | synthetic app plus the test guard at a known ref | deleted |
| One Vercel project | build command set to the provenance one-liner | deleted |
| **Vercel token, project-scoped to that project** | create, read back, promote | revoked |
| GitHub token, scoped as above | `P2B_GH_HDR` and `P2B_GH_READ_TOKEN` | revoked |

Both credentials are listed deliberately: the Vercel one is what performs every
creation, read-back and promotion in these proofs, and an earlier draft named
only GitHub's.

### Hostnames are disposable-only

**No Price2Book domain is used, aliased, pointed at, or configured at any point.**
Specifically not `price2book.com`, `www.price2book.com` or `app.price2book.com` —
the values in `CANONICAL.canonicalHosts` are what the proofs must *not* touch.

Every host in these proofs is a Vercel-generated `*.vercel.app` name belonging to
the disposable project. Where a proof needs a multi-host shape, it uses several
disposable `*.vercel.app` aliases on that project to reproduce the *shape* — a
primary and secondaries — never the identities.

**Custom domains and DNS are out of scope and need separate authorization.** If a
proof turns out to require a real custom domain to be meaningful, it is scoped
down or deferred and the limitation is recorded; it is never resolved by reaching
for a production domain.

### Evidence before cleanup

Evidence is exported and preserved **before** any teardown, and cleanup is itself
separately approved. A deleted project with unpreserved evidence makes the run
unrepeatable and the findings unciteable.

## How results are treated

**A surprising result is evidence, not a decision.** Each proof below records a
finding. Changing the release mechanism is a separate decision, taken
afterwards, with the evidence in hand. In particular:

- **A guard refusal is not proof the guard is wrong — and a refusal message is
  not proof the guard ran.** Provenance-shaped output can be printed by something
  that never executed the guard, so a refusal is read only alongside the
  effective build command and the identified guard artifact (proof 4).
- **Refusal codes are not uniformly "configuration".** `NOT_PRODUCTION`,
  `NOT_GITHUB`, `WRONG_OWNER`, `WRONG_REPO`, `WRONG_REF`, `NO_SHA` and
  `NO_READ_CREDENTIAL` describe missing or mismatched **configuration**, and
  API-created deployments are already known to carry empty `VERCEL_GIT_*` in the
  CLI case, which would produce exactly those. But `SHA_NOT_MAIN` and
  `MAIN_UNREADABLE` are different in kind: `SHA_NOT_MAIN` is the guard doing its
  job — a **legitimate safety rejection** of a commit that is not the ref's head
  — and `MAIN_UNREADABLE` is a deliberate fail-closed on an unreliable read.
  Each code is diagnosed on its own terms; none is a verdict on the design.
- **Aliases that do not move are an already-handled outcome.** `verifyHosts`
  records `alias points at X, expected Y`, `complete` is false, and the run
  returns `INCOMPLETE` holding its lock. That is the designed behaviour. It does
  **not** authorize adding alias mutation to Phase C.
- **A successful git baseline does not undo the forgery evidence.** Proof 1
  establishes a reference record. It cannot un-demonstrate that metadata was
  forgeable, and causation remains the basis regardless of how proof 1 reads.

## The proofs

### 1 — A successful git-triggered build

*Depends on it:* everything downstream. The forged deployments DID reach
`READY`; what was blocked was the genuine git-push baseline. So the gap is not
"a successful build" — it is a successful build *whose origin is not in doubt*,
which is the only thing a forged record can be compared against.

Push a commit to the disposable repo, let Vercel build it from the git
integration, capture the whole deployment record. This is the control against
which 3 and 6 are read, and it must come first.

*Finding if it differs from the probe's records:* the field-level conclusions in
the origin-trust observation are narrower than stated and get re-scoped. The
forgery itself stands either way — proof 1 supplies the missing comparand, it
does not re-open the question.

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

The experiment is about whether a **completed deployment's settings are
historical**, not about whether the API accepts a write:

1. Complete a successful build (proof 1's deployment).
2. Save its **deployment-scoped effective settings** — the five compared fields.
3. Change the **project's** settings to different values.
4. Re-read the historical deployment and confirm its settings are unchanged.

Attempting to `PATCH` or re-`POST` a deployment is a *different* experiment,
about API write surface, and does not replace this one. If it is run at all it is
recorded separately and does not stand in for step 4.

*Finding if the historical settings follow the project's:* a candidate read back
after a project change would describe settings it was not built with, so
read-back would no longer establish what was built, and the receipt binding
(runId ↔ candidate ↔ sha ↔ outgoing baseline) would need to bind something the
platform cannot restate. What it should bind instead is a separate decision.

### 4 — The guard runs on an API-created deployment

*Depends on it:* `decideBuildProvenance` being reached at all. The guard is
mirrored into the build command *because* the dashboard Build Command is what an
old checkout cannot bypass — but every observation so far is of git-triggered
builds, and Phase B creates through the API.

**A log line is not evidence.** The origin-trust work already demonstrated that
provenance-shaped messages can be printed by something that never ran the guard,
so `PROVENANCE REFUSED (<CODE>)` in a build log is no stronger on its own than
any other string. Three things are recorded *together*, or the run establishes
nothing:

| Recorded | Answers |
|---|---|
| The **effective build command** on that deployment | what actually ran |
| The **identified guard artifact** (blob hash) it fetched | *which* guard ran |
| The **observed outcome** | what that guard decided |

Two cases, and both are required:

- **Positive** — configured so the guard should accept: the guard passes, the
  application build runs, and the deployment reaches `READY`. Only this case can
  establish that the guard runs on an API-created deployment *and lets a
  legitimate build through*.
- **Negative** — configured so the guard should refuse: the chain stops **before
  the application build**, evidenced by the absence of build output that only
  `npm run build` produces.

A refusal is good negative-case evidence and **cannot satisfy the positive
case**. A run that only ever refuses has not shown the guard is reachable on a
passing path.

*Finding if it does not run:* the guard would not protect the path the release
uses. Whether that is a configuration gap or a design gap is decided from the
recorded triple, afterwards.

### 5 — Creation without `projectSettings` uses the approved command

*Depends on it:* the comment at `createDeployment` in
`scripts/release-production.ts` — *"NO projectSettings, so the project's approved
configuration applies rather than anything this request carries."* That is an
assumption stated as a fact.

**Settled by recorded configuration, not by logs.** Create without
`projectSettings`, then read the candidate's **effective configuration** back and
compare all five fields `compareBuild` compares against the test's approved
values:

    rootDirectory   installCommand   buildCommand   outputDirectory   framework

The build log corroborates that evidence — it shows the command running — but the
recorded configuration is what settles the question, because a log can show a
command without establishing which configuration supplied it.

Then create *with* a `projectSettings.buildCommand` and confirm the request can
override, establishing that omitting it is a real choice and not a no-op.

*Finding if omission does not mean "use the project's":* the release would need
to send approved settings explicitly and verify them on read-back.

### 6 — Whether promotion moves the primary alias

*Depends on it:* `verifyHosts` and the three-state `AliasMapping`. The isolated
test showed the primary alias did **not** follow a promotion — one observation,
on a project whose alias configuration did not resemble canonical.

Configure the disposable project with several `*.vercel.app` aliases so it has
the same *shape* as canonical — one primary, two secondaries — then promote and
read the alias listing back. The shape is what the proof needs; the canonical
hostnames are explicitly not used (see "Hostnames are disposable-only").

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
release pause and cutover. Custom domains and DNS. No canonical credential is
used at any point; nothing here touches `prj_zB0QVq80340s2dVt7X3c1ewKgHtT` or any
`price2book.com` hostname.

---

## Authorization record

Authorized 4 September 2026, within this boundary, recorded verbatim:

- Only the new disposable repository and Vercel project, **identified before
  testing**.
- Test commits/pushes, builds and promotions permitted **only there**.
- Fresh scoped credentials; **no production domains, DNS, database or
  canonical-project changes**.
- Preserve evidence, revoke credentials afterward, and **retain resources until
  cleanup is separately approved**.
- **Stop and report unexpected results** — do not change the release mechanism
  mid-test.

**Push exception.** The standing "pushes on hold" is lifted for the disposable
repository only. Pushes to production and to release branches remain prohibited.

**Accepted limitation.** Disposable `*.vercel.app` results will not establish
production custom-domain behaviour. This lands almost entirely on proof 6: it can
show promotion's alias behaviour is wrong, but a clean result leaves "does
promotion complete a release on the canonical domains" open. Proofs 2–5 are
unaffected, turning on build commands, configuration and guard execution rather
than hostnames.
