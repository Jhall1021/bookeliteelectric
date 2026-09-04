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

## Preconditions

Two blockers, both visible in the code today:

- **`CANONICAL.repoId` is `0`** (`scripts/_releaseProvenance.ts`), marked PENDING
  in its own comment. `gitSource` identifies a repository by numeric id, and the
  release verifies GitHub's value against the project link. Until it is read, the
  canonical comparison compares against zero. Reading it is an unauthenticated
  GET against a public repository — **no credential required**, and it can be
  done before any of this is authorized.
- **Proof 4 needs a second credential.** The provenance build command fetches the
  guard with `$P2B_GH_HDR`, a Production environment variable carrying an
  `Authorization` header. The disposable project needs its own scoped GitHub
  token for that fetch, separate from the Vercel token. Scope: contents:read on
  the guard repository only.

Resources, all disposable and all recreated fresh rather than reused from the
origin-trust probe:

| Resource | Purpose | Disposal |
|---|---|---|
| One private GitHub repo | synthetic app + the guard at a known ref | deleted at the end |
| One Vercel project | build command set to the provenance one-liner | deleted at the end |
| Vercel token, project-scoped | create, inspect, promote | revoked at the end |
| GitHub token, contents:read | the guard fetch, via `P2B_GH_HDR` | revoked at the end |

Credential handling is unchanged from the origin-trust test: a local hidden-input
helper the operator runs in their own Terminal, values written to a file outside
any backup, never in chat, argv, shell history or logs. `guardUrl` is already a
parameter so the disposable project can point at its own repo and ref.

## The proofs

### 1 — A successful git-triggered build

*Depends on it:* everything. The forgery evidence was gathered on records that
never completed a successful production build, so there is no reference for what
a genuine one looks like.

Push a commit, let Vercel build it from the git integration, capture the whole
deployment record. This is the control against which 3 and 6 are read, and it
must come first.

*If it differs from the probe's records:* the field-level conclusions in the
origin-trust observation are narrower than stated and get re-scoped.

### 2 — The config-file override

*Depends on it:* `preflightDecision`'s `CONFIG_FILE_PRESENT` refusal
(`scripts/_releaseControl.ts`), which refuses any commit whose tree contains
`vercel.json`, `vercel.toml` or `vercel.ts` on the stated grounds that such a
file *"overrides the project settings"*.

Commit a `vercel.json` carrying a `buildCommand` that writes a marker, deploy it,
and read the build log: did the dashboard command run, or the file's?

*This is the decisive one.* If a repo file overrides the dashboard build command,
then the provenance guard — which lives in the dashboard command precisely
because an old checkout cannot bypass it — is bypassable by any commit that adds
a config file, and the refusal above is load-bearing rather than cautious. If it
does *not* override, the refusal is merely conservative and can be documented as
such. Either answer is worth having; the current code assumes the dangerous one,
which is the right way round to be wrong.

### 3 — Immutability on a successful build

*Depends on it:* the release keeping the id from its own creation request and
reading the candidate back later. If a record can be mutated after a successful
build, "read it back" stops being a check.

Take the proof-1 deployment and attempt to change its record — re-POST the same
id, patch the fields the probe showed were accepted at creation.

*If it is mutable:* the receipt binding (runId ↔ candidate ↔ sha ↔ outgoing
baseline) needs to bind something the platform cannot rewrite.

### 4 — The guard runs on an API-created deployment

*Depends on it:* `decideBuildProvenance` being reached at all. The guard is
mirrored into the build command *because* the dashboard Build Command is what an
old checkout cannot bypass — but every observation so far is of git-triggered
builds.

Create a deployment through the API, and check the build log for the guard's
output. Run it twice: once where the guard should accept, once where it should
refuse, so a guard that never executes is not mistaken for one that passed.

*If it does not run on API-created deployments:* Phase B creates deployments
through the API, so the guard would not protect the path the release actually
uses — a redesign, not an adjustment.

### 5 — Creation without `projectSettings` uses the approved command

*Depends on it:* the comment at `createDeployment` in
`scripts/release-production.ts` — *"NO projectSettings, so the project's approved
configuration applies rather than anything this request carries."* That is an
assumption stated as a fact.

Create without `projectSettings`; read the build log for which command ran.
Then create *with* a `projectSettings.buildCommand` and confirm the request can
in fact override — establishing that omitting it is a real choice and not a
no-op.

*If omission does not mean "use the project's":* the release must send the
approved settings explicitly and verify them on read-back.

### 6 — Whether promotion moves the primary alias

*Depends on it:* `verifyHosts` and the three-state `AliasMapping`. The isolated
test showed the primary alias did **not** follow a promotion — a single
observation on a project whose alias configuration did not resemble canonical.

Configure aliases like canonical (apex, www, app), promote, and read the alias
listing back.

*If the primary alias does not move:* promotion alone does not complete a
release, and Phase C is missing a step — the most likely of the six to change
the release's shape.

## Order

1 → 5 → 4 → 2 → 3 → 6. Proof 1 is the control. 5 and 4 share a project
configuration and should run together. 2 is decisive and is scheduled once the
build-command picture is settled, so its result is unambiguous. 3 and 6 both
consume the proof-1 deployment and come last.

Each proof is captured before the next begins: request, response, build log,
alias listing, redacted the same way the origin-trust evidence was. A proof that
cannot be captured did not happen.

## Out of scope

Production, the canonical project, pushes, merges, repository transfer, the
release pause and cutover. No canonical credential is used at any point; nothing
here touches `prj_zB0QVq80340s2dVt7X3c1ewKgHtT`.

## Known gap, separate from this plan

The offline checks run against the reconstructed archive with previously supplied
dependencies. They do not establish a full-checkout typecheck or the other
suites. That is a cheap offline item and is not a precondition for any proof
above.
