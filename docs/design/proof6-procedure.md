# Proof 6 — proposed procedure

**Planning only. No promotion, restoration or any other write is authorized.**

Does promotion move the hosts? Phase C promotes and then verifies, and
`verifyHosts` checks each host separately. Whether that separateness is
necessary — and whether promotion moves a target, its aliases, or both — has
never been observed.

| | |
|---|---|
| Candidate | `dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS` — READY, `24a5583…`, Proof 4 Case 1 |
| Outgoing production target | `dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf` — `afa2915…` |

## The accepted restorability tradeoff

Routing is currently **split**, and *creation* split it, not promotion:

    production target                       dpl_8uZb   (afa2915…)
    p2b-release-proofs.vercel.app           dpl_8uZb   (afa2915…)
    …-price2-book.vercel.app                dpl_8XKM   (24a5583…)
    …-git-main-price2-book.vercel.app       dpl_8XKM   (24a5583…)

If promotion gathers the hosts, promoting the outgoing deployment back will
likely leave them gathered on the outgoing one: the target restored, the split
not.

**This is accepted.** After Proof 6 the original production target **must** be
restored; the generated-alias split need not be reproduced, and the aliases may
end gathered on the outgoing deployment. **No alias is manually assigned or
removed to recreate the split** — not to tidy the result, not for symmetry.

Restoring the target is mandatory. Alias differences are reported and accepted
within the disposable boundary.

## 1 — Revalidate the candidate by exact id

Read `dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS` directly. Require, or stop:

- `projectId` is `prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q`
- `readyState` READY, `target` production
- `gitSource.sha` is `24a55837d2e54f7bfee12b72d7eb0c2bc7a10d2d`
- the historical five-field configuration matches what Proof 3 preserved
  (`rootDirectory` **absent**, not null — compared raw and normalized)
- its build log still shows `PROVENANCE OK 24a5583…` at a lower index than
  `P2B-APP-BUILD-RAN`, with no `PROVENANCE REFUSED`

The candidate id comes from **the preserved Proof 4 Case 1 creation response**,
not from a listing and not from any metadata claim. Revalidation confirms that
recorded id; it never selects one.

## 2 — Preserve before mutating

Written to the evidence directory before any write, and re-read to confirm they
round-trip:

| | |
|---|---|
| production target | `targets.production.id` + `readyState` |
| alias mappings | all three named hosts, host by host; the `with-override` preview alias recorded for completeness and classified separately |
| **served identity per host** | `GET https://<host>/build-info.json` for **every** host — see below on what it actually exposes |
| outgoing deployment id | `dpl_8uZb…` |
| candidate id and sha | `dpl_8XKM…`, `24a5583…` |

The served identity matters independently of the alias record: an alias table is
what Vercel says, and `build-info.json` is what a client actually receives.
`verifyHosts` checks both for the same reason.

### What `build-info.json` actually exposes — established first, never assumed

**Before any write**, every current host is read and the file's fields are
recorded as observed.

The fixture writes `marker`, `commitSha`, `deploymentId` and `builtAt`. But
`commitSha` comes from `VERCEL_GIT_COMMIT_SHA` and **`deploymentId` comes from
`VERCEL_DEPLOYMENT_ID`, which has never appeared in any build log in this work**
— the application build printed the `VERCEL_GIT_*` set and `VERCEL_ENV`, and
never that variable. Its value may well be `null` in the served file.

So the rule is explicit:

- if the served file exposes a usable `deploymentId`, it is recorded **as served
  evidence**, alongside the alias API's mapping, and the two are compared;
- if it exposes only `commitSha`, then **the alias API is the source for
  deployment identity and the served file is the source for the sha, as two
  separate pieces of evidence**. A served deployment id is never inferred from
  an alias record, and never invented.

A host that cannot be read at all is **unreadable**, not "unchanged".

## 3 — The promotion operation

    POST https://api.vercel.com/v10/projects/{projectId}/promote/{deploymentId}
    Authorization: Bearer <REDACTED — vcp_ project-scoped, babd0443>
    (empty body; no teamId, no slug)

**What is expected and what is recorded rather than assumed.** The origin-trust
investigation observed a promote call answering **HTTP 201**. Whether this
endpoint returns a body — and what is in it — is **recorded as evidence**, not
relied upon.

That is not a detail. **If promotion returns no usable body, the promoted
deployment's identity cannot come from the response**, which is precisely why
the candidate id must come from the preserved creation record. A promotion whose
subject you learn from a listing afterwards is the attestation mistake again.

Status handling matches Proof 3: 2xx success; 408, 429 and 5xx **ambiguous**
(checked before the generic 4xx rule); other 4xx a definite refusal that changed
nothing; a transport failure ambiguous. **No blind retry, ever.**

### Resolving an ambiguous promotion — the target alone is not enough

An ambiguous response is resolved by a **complete, stable routing observation**,
not by reading `targets.production`:

1. the production target
2. **every** baseline alias mapping, host by host
3. **every** host's served identity

**"Nothing happened" is permitted only when all three classes match the
preserved baseline**, across the required stable reads. Anything short of that
is not a clean miss.

**If the target is unchanged but any alias or served identity has changed — or
is unreadable — the promotion MAY HAVE PARTIALLY APPLIED.** It is treated as a
mutation, not as "nothing happened": the authorized restoration path runs, or
`RECOVERY_REQUIRED` is reported if it cannot. An unreadable class is not a
matching class; it is an unknown, and an unknown cannot establish absence.

This is the same error the whole release exists to avoid — reading "I did not
see a change" as "nothing changed" — and a target-only check would have
reproduced it exactly. Proof 4 Case 1 is the concrete reason: there, aliases
moved while the target did not, so the target is demonstrably not a proxy for
routing in this project.

## 4 — Observation, bounded

After promotion, poll with a bound (10 attempts, ~15s apart, ~150s ceiling),
stopping early once a full observation is stable across two consecutive reads:

- `targets.production.id`
- each alias mapping, **host by host**
- each host's `build-info.json` — `commitSha` and `deploymentId`

A timeout without stability is **not** "it did not move": it is
**unestablished**, recorded as such.

## 5 — Independent classification

Three questions kept apart, never collapsed into "it worked":

1. **target** — changed to the candidate / unchanged / unreadable
2. **each alias** — moved to the candidate / unchanged / unreadable, *per host*
3. **each host's served sha** — `24a5583…` / `afa2915…` / unreachable, *per host*

The interesting outcomes are the disagreements: a target that moves while an
alias does not, aliases that move differently from one another, or an alias
pointing at the candidate while the host still serves the old sha. Each is
recorded as itself.

## 6 — Preserve the complete post-promotion state

Everything from §2 again, in full, **before restoration is attempted** — so the
promoted state is documented even if restoration then fails.

## 7 — Restoration

The reversal is **the same operation in the other direction**:

    POST https://api.vercel.com/v10/projects/{projectId}/promote/dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf

**The rollback endpoint is not used at any point.** Switching endpoints midway
would mean the two directions were not comparable, and a difference in outcome
could not be attributed to direction rather than to mechanism. One endpoint,
both ways.

The outgoing deployment id `dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf` is preserved to
its own file before any write and printed on every failure path.

Then observe and preserve the final target, every mapping and every served
identity, by the same bounded procedure.

**Target restoration and alias restoration are separate facts.** A restored
target with aliases somewhere else is reported exactly that way. **No alias is
manually assigned or removed** — not to tidy the result, not to reproduce the
split. If restoration leaves routing in a shape that needs manual alias work,
that is reported and stops there, for separate authorization.

## 8 — Stated in advance

| Situation | Response |
|---|---|
| **Ambiguous promotion** | resolve by COMPLETE stable observation — target, every alias, every served identity. All three match the baseline → nothing happened, stop. Target on the candidate → proceed as promoted. **Target unchanged but any alias or served identity changed or unreadable → treat as partially applied**: restore, or `RECOVERY_REQUIRED`. Nothing readable → `RECOVERY_REQUIRED` |
| **Ambiguous restoration** | the same full-observation rule. **The target is what must be restored**; if the target is back on the outgoing deployment the restoration succeeded, and alias differences are reported, not remediated. Target not restored, or unreadable → `RECOVERY_REQUIRED`, naming the preserved outgoing id |
| **Target moved, aliases did not** | a finding, not a failure. Promotion moves the target and not the hosts, so Phase C's per-host verification is load-bearing and the release must not treat a moved target as a completed release |
| **Aliases moved differently from one another** | a finding. `verifyHosts` checking hosts separately is necessary rather than defensive, and a partial move is exactly the `INCOMPLETE` outcome the release already models |
| **Alias moved but host serves the old sha** | propagation, or an alias record that does not reflect what is served. Recorded as a disagreement between the table and the wire; poll to the bound, then report as observed |
| **Restoration does not reproduce the split** | **expected and accepted.** Report target and aliases as separate facts; do not remediate, and do not touch an alias by hand |
| **Restoration does not restore the target** | `RECOVERY_REQUIRED`; stop, no further proof |

Once promotion is definitely applied, restoration is attempted even if an
observation or assertion fails, via the same `EXIT`/`INT`/`TERM`/`HUP` trap
pattern Proof 3 used — with intent recorded **before** the write, because the
server acts before the client learns of it. **It cannot survive `SIGKILL`, machine failure or power loss** — nothing in a
shell can, and this is not claimed. The outgoing deployment id
`dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf` is preserved to its own file before the first
write and printed on every failure path, so manual restoration is always
possible: promote that id through the same endpoint.

## 9 — Offline harness first

A stub API holding mutable target, alias and served-identity state — three
classes that can disagree, because the cases worth testing are the ones where
they do. Acceptance cases:

1. **success** — target and all aliases move; every host serves the candidate sha
2. **incomplete routing** — target moves, one alias does not; hosts disagree
3. **ambiguous promotion, nothing applied** — 5xx, and all three classes match
   the baseline → "nothing happened", stop
4. **ambiguous promotion, fully applied** — 5xx, target on the candidate → proceed as promoted
5. **ambiguous, target unchanged but ONE ALIAS MOVED** — must be treated as a
   partial mutation and restored, **never** as "nothing happened"
6. **target changed but one alias unchanged** — recorded as an incomplete
   routing finding, both facts kept separate
7. **alias mapping changed while the served sha is still the old one** — a
   disagreement between the table and the wire; polled to the bound, then
   reported as observed
8. **ambiguous restoration** — 5xx on the reversal, resolved by full observation
9. **restoration returns the target but leaves aliases in a different
   arrangement** — a PASS on the mandatory fact, with alias differences reported
10. **observation failure** — a host unreachable, or an alias listing unreadable:
    unreadable, never "unchanged"
11. **restoration failure** — reversal refused, or the target not restored →
    `RECOVERY_REQUIRED`

Any failing offline case stops before the live write.

## Evidence boundary

**This proves behavior only for the disposable project's generated
`*.vercel.app` aliases.** It does **not** establish custom-domain behavior and
must not be generalized to `price2book.com`, `www.price2book.com` or
`app.price2book.com`. Those are custom domains on a project with
`autoAssignCustomDomains` disabled — a different class, on a different project,
under a different setting. Nothing here is evidence about them.

No custom domain, DNS, project-setting, environment-variable, repository,
deployment-creation, cleanup or canonical-resource operation is part of this.
