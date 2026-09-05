# Live proofs 1–6 — final matrix

All six ran against the disposable project `p2b-release-proofs`
(`prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q`). **No canonical resource was touched at any
point.**

---

## Proof 1 — a genuine git-push production build

**Question** — is there a successful production build whose origin is not in
doubt, to compare a forged record against?

**Answer** — yes. Commit `24a5583…` (sole parent `afa2915…`) produced
`dpl_DNdgxhTUa7zGBUTFFbEEPvNSFVSx` three seconds later: `source: git`,
`importSource` absent, `target: production`, READY. `PROVENANCE OK 24a5583…` at
log index 9, `P2B-APP-BUILD-RAN` at 12.

**Supports** — the guard runs and admits a legitimate git-triggered build, in the
order the `&&` chain promises.

**Limitation** — `source` is caller-writable (origin-trust). The classification
rests on the operator's account, the fields agreeing with it, **and** the commit
lineage together. No single field carries it. An import-created deployment
carries the complete `githubCommit*` set including
`githubCommitVerification: verified` — that metadata does **not** establish a
push.

**Change required** — none.

---

## Proof 2 — the config-file override

**Question** — does a repository `vercel.json` override the dashboard build
command?

**Answer** — **YES.** `dpl_D4zqe5wVSEJjPMscXCJHs7E7camz` recorded
`echo P2B-PROOF2-OVERRIDE-RAN && npm run build` as its effective command, printed
the marker, ran the application build, reached READY, and **never fetched or ran
the guard** — while the project's own `buildCommand` stayed the provenance
one-liner.

**Supports** — `preflightDecision`'s `CONFIG_FILE_PRESENT` refusal is
**load-bearing**, not defence-in-depth. `TREE_TRUNCATED` matters as much: it stops
"could not see a config file" being read as "there is no config file".

**Limitation** — observed on a **Preview** deployment. Not established for a
production target. The effective command is recorded the same way for both, which
is suggestive and not observed.

**Change required** — documentation only (record as load-bearing). Code already
correct.

---

## Proof 3 — historical deployment settings

**Question** — are a completed deployment's settings historical, or do they
follow the project?

**Answer** — **historical.** With the project's `buildCommand` changed,
`dpl_8XKM…` read back by exact id was identical in raw **and** normalized form.
A project-settings change created no deployment (6 before, 6 after).

**Supports** — reading a candidate back describes what it was **built with**;
`compareBuild` cannot have its value moved out from under it. The receipt needs
nothing further on this account.

**Limitation** — one deployment, one project, one field changed and changed back.
Not immutability of the whole record against every kind of project change, and
not a claim about Vercel in general.

**Change required** — none. A test asserting `rootDirectory` absent → `null`
normalization would be worth adding (see delta).

---

## Proof 4 — the guard on an API-created deployment

**Question** — does the guard run on the path Phase B uses, and both admit and
refuse?

**Answer** — **both.** Positive `dpl_8XKM…`: `PROVENANCE OK 24a5583…` (index 9),
`P2B-APP-BUILD-RAN` (index 12), READY. Negative `dpl_GUWn…` pinned to the
historical commit: `PROVENANCE REFUSED (SHA_NOT_MAIN)` naming **both** shas, no
marker, ERROR.

**Supports** — the guard executes on API-created deployments and decides
correctly in both directions. `SHA_NOT_MAIN` is the last check, so reaching it
evidences production target, provider, owner, repo, ref, a full sha and a working
read credential were all correct on a deployment nobody pushed. `source` is
**null** for API-created deployments.

**Limitation** — the running guard prints no digest, so identity rests on three
converging facts (blob pinned at `main` before and after, the effective command
naming that path and ref, the emitted strings). Convergence, not a hash of the
executed bytes.

**Change required** — none. Optional hardening: have the guard echo its own
digest (repository change; separate authorization).

---

## Proof 5 — creation without `projectSettings`

**Question** — does a request carrying no `projectSettings` inherit the
project's?

**Answer** — **yes.** `dpl_2zZV…` came back with the provenance one-liner,
`outputDirectory: public`, `installCommand`/`framework` null. The build log's
error quotes the command it actually ran — the same one-liner — so the
configuration was **executed**, not merely echoed.

**Supports** — the comment at `createDeployment` is correct as written: omitting
`projectSettings` is a real choice, not a no-op.

**Limitation** — `rootDirectory` comes back **absent**, not `null`. Harmless only
because `liveIO`'s `settings()` maps `?? null` before `compareBuild` sees it —
that normalization is the only thing between an absent field and a false drift
refusal. Also: `target: staging` does **not** receive Production-only variables,
so a staging build cannot exercise the guard at all.

**Change required** — none. Test gap noted in the delta.

---

## Proof 6 — promotion and routing

**Question** — does promotion move the production target, the aliases, or both?

**Answer** — **both, together.** `POST /v10/projects/{id}/promote/{id}` → HTTP
201, **response body one byte**. Target `dpl_8uZb…` → `dpl_8XKM…`; **all three**
generated aliases moved to the candidate, including the shortest project alias
that had never moved for a creation. Access state unchanged on every host. The
one readable host served the candidate's sha and deployment id.

**Supports** — promotion and **creation** affect routing **differently**
(creation moved two of three aliases and left the target alone), so separating
Phase B from Phase C matches a real difference. The empty response body confirms
identity cannot come from the promote response.

**Limitation** — **generated `*.vercel.app` aliases only.** Two hosts are behind
Deployment Protection; for them this establishes **alias mapping and access state
only** — what they served is **unestablished**, and nothing was inferred from a
redirect. **Not evidence about `price2book.com`, `www.price2book.com` or
`app.price2book.com`** — custom domains, different project,
`autoAssignCustomDomains` disabled there.

**Change required** — none. Test gap: no fixture exercises `observeHosts` against
a protection redirect.

---

## Refuted along the way

| Claim | Status |
|---|---|
| The initial READY deployment was proof 1 | **wrong** — `source: import`; I read `importSource` and did not weigh it |
| The disposable project's token could reach production | **wrong** — inferred from `accountId`; the `vcp_` token is project-scoped, production denied by id and name |
| Creation at `target: production` is "not inert" for the governed hosts | **wrong scope** — generated aliases moved; the production target and the canonical host class did not |
| Access state would invert after promotion | **wrong** — it did not change; protection tracks the kind of generated host, not what it points at |
| `build-info.json`'s `deploymentId` might be null | **resolved** — it is populated and matches the alias record |
