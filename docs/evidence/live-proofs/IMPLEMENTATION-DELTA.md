# `release/controlled-release` audited against the live evidence

**Nothing in this document has been implemented.** It is the audit result and the
exact delta, for separate authorization.

## The nine required confirmations — all hold

| # | Requirement | Verdict | Where |
|---|---|---|---|
| 1 | Phase B never selects its candidate from a listing or claimed metadata | **holds** | `createDeployment` returns `r.body.id` from its **own** POST; the only `/v13/deployments` reference is that create call. No listing endpoint is read in the create path. |
| 2 | Phase B sends no `projectSettings` | **holds** | body is `{name, project, target, gitSource}` only |
| 3 | Repository config presence and unreadable/truncated trees fail closed | **holds** | `TREE_UNREADABLE` (98), `TREE_TRUNCATED` (101), `CONFIG_FILE_PRESENT` (105) — all before anything is created |
| 4 | Phase C uses the candidate id from the durable creation receipt | **holds** | receipt carries `runId, candidateId, sha, outgoingDeploymentId, outgoingAliases`; Phase C loads it and refuses without it |
| 5 | The empty promotion response body is never used for identity | **holds** | `promoteDeployment: (id) => Promise<void>` — the body is read only for an error message. **Proof 6 measured that body at one byte.** |
| 6 | Target, alias mapping and served identity stay separate facts | **holds** | `verifyHosts` takes per-host `aliasDeploymentId`, per-host `served`, **and** a re-read `productionTarget`; each contributes its own problem string |
| 7 | Ambiguous promotion cannot resolve from the production target alone | **holds** | verification requires all three classes; an ambiguous promote returns `PROMOTE_UNCERTAIN`, **keeps the lock**, and says to establish what happened before retrying |
| 8 | Historical candidate configuration is checked from the deployment record | **holds** | `readCandidate` reads `/v13/deployments/{id}` and takes `projectSettings` from that record, normalized by `settings()` |
| 9 | Recovery retains the outgoing id and does not blindly retry | **holds** | `RECOVERY_REQUIRED` and `INCOMPLETE` both return `outgoing` and `outgoingAliases`, keep the lock, and remediate nothing |

`isDefiniteFailure` treats **408, 425, 429 and all 5xx as ambiguous** and only
other 4xx as definite — matching what the proofs required of their own runners.

## Required correction — one, and it is a blocker

### C1. `CANONICAL.repoId` is `0`

`scripts/_releaseProvenance.ts:50`. `gitSource` identifies a repository by
numeric id, and Phase B sends `repoId: CANONICAL.repoId` in its create body, so
today it would send **zero**.

**This is unresolved and must not be resolved by guessing.** Two numbers appear
in this work and **neither is the canonical one**:

- `1357368650` — the **disposable** repo `Price2Book/p2b-release-proofs`
- `1357038688` — the **origin-trust probe** repo, named in the code comment

Reading the canonical repository's id and pinning it are **two separate
actions**, and neither is authorized here.

## Recommended, not required

### R1. Record `CONFIG_FILE_PRESENT` as load-bearing (documentation)

Proof 2 demonstrated the bypass. The refusal's comment says a config file
"overrides the project settings" — now an observation, not an assumption. Worth
citing the evidence at the refusal so a later reader does not relax it as
belt-and-braces.

### R2. A test pinning the absent-`rootDirectory` normalization

Proofs 4 and 5 both showed `rootDirectory` returned **absent**, not `null`.
`settings()`'s `?? null` is the only thing preventing a false
`PROJECT_SETTINGS_NOT_APPROVED`. No test asserts it, so a refactor could remove
it silently.

### R3. A fixture exercising `observeHosts` against a protection redirect

`observeHosts` uses `redirect: "follow"`. Under Deployment Protection it would
follow to `vercel.com/sso-api`, get HTML, and `r.json()` would throw → `served`
unread → `INCOMPLETE`. **That is correct fail-closed behaviour, established by
reading the code, not by a test.** Proof 6 met real protection redirects; the
release has never been run against one.

### R4. Note that generated aliases are deliberately out of scope

The release enumerates only the three canonical hosts and `readAliasPage` skips
everything else as "genuinely not ours". Proof 6 showed promotion moves generated
aliases too. That is correctly ignored — worth a sentence so a later reader does
not mistake the omission for an oversight.

## What the evidence does NOT license

- **No custom-domain behaviour is established.** Every routing observation is of
  generated `*.vercel.app` hosts on the disposable project. Proof 6 must not be
  read as "promotion moves `price2book.com`".
- **Protected hosts establish nothing about served content** — alias mapping and
  access state only.
- **Proof 2 is preview-scoped.** The config-file override is not established for
  a production target.
- **`source` and `importSource` are not security signals.** They classified a
  controlled test event where the operator's account and the fields agreed.
