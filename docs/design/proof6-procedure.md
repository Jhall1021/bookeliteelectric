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

## Read this before authorizing: the split is probably not restorable

Routing is currently **split**, and it was not promotion that split it:

    production target                       dpl_8uZb   (afa2915…)
    p2b-release-proofs.vercel.app           dpl_8uZb   (afa2915…)
    …-price2-book.vercel.app                dpl_8XKM   (24a5583…)
    …-git-main-price2-book.vercel.app       dpl_8XKM   (24a5583…)

Two generated aliases followed the newest READY production **creation** in Proof
4 Case 1. The target and the shortest alias did not move.

**So if promotion gathers the hosts onto one deployment, promoting the outgoing
deployment back will very likely leave them gathered — on the outgoing one.**
The target would be restored; the *split* would not. Reproducing it would need
either a new deployment (not authorized) or manual alias assignment (explicitly
not authorized).

I am flagging this as a **likely outcome, not an edge case**. If the split must
survive, this proof should not run in this form. If a restored *target* with
uniformly-restored aliases is acceptable, it can — but that should be decided
now, not discovered afterwards.

The practical impact is small and worth weighing against it: both deployments
build the same fixture, differing by one README line, so whichever a host serves,
the content is materially identical.

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
| **served build-info per host** | `GET https://<host>/build-info.json` → `commitSha`, `deploymentId`, for **every** host |
| outgoing deployment id | `dpl_8uZb…` |
| candidate id and sha | `dpl_8XKM…`, `24a5583…` |

The served identity matters independently of the alias record: an alias table is
what Vercel says, and `build-info.json` is what a client actually receives.
`verifyHosts` checks both for the same reason.

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
nothing; a transport failure ambiguous. **No blind retry, ever** — an ambiguous
promotion is resolved by reading the target back.

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

The documented reversal: promote the **outgoing** deployment `dpl_8uZb…` by the
same operation. Vercel also documents a rollback endpoint; whichever is used is
recorded, and the same one is used for both directions so the comparison is
symmetric.

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
| **Ambiguous promotion** | read the target back. Candidate → proceed as promoted. Outgoing → nothing happened, stop. Unreadable → `RECOVERY_REQUIRED` |
| **Ambiguous restoration** | same resolution by reading. Unresolvable → `RECOVERY_REQUIRED`, naming the outgoing id to restore by hand |
| **Target moved, aliases did not** | a finding, not a failure. Promotion moves the target and not the hosts, so Phase C's per-host verification is load-bearing and the release must not treat a moved target as a completed release |
| **Aliases moved differently from one another** | a finding. `verifyHosts` checking hosts separately is necessary rather than defensive, and a partial move is exactly the `INCOMPLETE` outcome the release already models |
| **Alias moved but host serves the old sha** | propagation, or an alias record that does not reflect what is served. Recorded as a disagreement between the table and the wire; poll to the bound, then report as observed |
| **Restoration does not reproduce the split** | **expected**, per the warning above. Report target and aliases separately; do not remediate |
| **Restoration does not restore the target** | `RECOVERY_REQUIRED`; stop, no further proof |

Once promotion is definitely applied, restoration is attempted even if an
observation or assertion fails, via the same `EXIT`/`INT`/`TERM`/`HUP` trap
pattern Proof 3 used — with intent recorded **before** the write, because the
server acts before the client learns of it. It cannot survive `SIGKILL` or power
loss; the outgoing id is preserved to a file and printed on every failure path.

## 9 — Offline harness first

A stub API holding mutable target and alias state, driving:

1. **success** — target and all aliases move, hosts serve the candidate sha
2. **incomplete routing** — target moves, one alias does not; hosts disagree
3. **ambiguous promotion** — 5xx, resolved by reading (both directions: applied and not)
4. **ambiguous restoration** — 5xx on the reversal, resolved by reading
5. **observation failure** — a host unreachable, or an alias listing unreadable
6. **restoration failure** — reversal refused, or target not restored → `RECOVERY_REQUIRED`

Any failing offline case stops before the live write.

## Evidence boundary

**This proves behaviour only for the disposable project's generated
`*.vercel.app` aliases.** It does **not** establish custom-domain behaviour and
must not be generalized to `price2book.com`, `www.price2book.com` or
`app.price2book.com`. Those are custom domains on a project with
`autoAssignCustomDomains` disabled — a different class, on a different project,
under a different setting. Nothing here is evidence about them.

No custom domain, DNS, project-setting, environment-variable, repository,
deployment-creation, cleanup or canonical-resource operation is part of this.
