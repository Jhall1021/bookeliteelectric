# Proof 3 — proposed procedure

**Planning only. No project-setting write is authorized.**

Are a completed deployment's settings **historical** — fixed at build time — or
do they follow the project's current configuration? If they follow, then reading
a candidate back after any settings change describes settings it was not built
with, and "read it back" stops being a check.

Subject: **`dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS`** — READY, created through the API
with no `projectSettings`, which is the path Phase B uses.

**This is not the API-write experiment.** Whether the API accepts a `PATCH`
against a deployment is a different question about write surface. It is not
proposed here and does not stand in for this.

## Does changing a project setting trigger a deployment?

**I am not asserting that it does not.** I have not verified it against Vercel's
documentation in this session, and a settings change that silently redeployed
would invalidate the test and touch the project unexpectedly.

So the procedure **measures** it: the deployment list is captured immediately
before the first write and again immediately after, and **any new deployment is
a stopping condition**. The answer becomes evidence rather than an assumption.

No Git activity occurs at any point. `main` and `with-override` are untouched;
nothing is pushed, no branch is created or deleted, no file changes. The only
writes are two `PATCH`es to the project's `buildCommand`.

## Preservation, before any write

1. `GET /v13/deployments/dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS` → save the **whole
   record** verbatim to `proof3-deployment-before.json`, so any field change is
   detectable, not only the five.
2. Extract the five effective fields in **two forms**:
   - **raw** — exactly as returned, including `rootDirectory` being *absent*
     rather than `null`, which is how it came back in proofs 4 and 5;
   - **normalized** — `?? null`, the form `liveIO`'s `settings()` produces and
     `compareBuild` actually compares.
   Both are preserved. Raw-to-raw detects any change at all; normalized-to-
   normalized answers the question the release cares about.
3. `GET /v9/projects/prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q` → save verbatim to
   `proof3-project-before.json`; record the five settings, `targets.production`
   and all aliases via `capture-state.sh`.
4. **Preserve the original `buildCommand` to its own file**, JSON-encoded,
   straight from the API response. **Restoration reads from that file. The value
   is never retyped, and never reconstructed from this document** — it contains
   quotes, backslashes and `$`, and a hand-copied restoration is how you turn a
   reversible test into an outage.
5. Round-trip check before proceeding: re-encode the preserved value and confirm
   it is byte-identical to what the API returned. If it is not, **stop before
   writing anything**.

## The temporary value

    echo P2B-PROOF3-TEMP && <the preserved original, verbatim>

Built by prefixing the preserved original, for one reason: if anything did
trigger a build, the guard would still run. A standalone command would remove it.

- original: 215 characters; prefix `echo P2B-PROOF3-TEMP && `: 24; total **239**
- Vercel's ceiling is **256** (`VERCEL_BUILD_COMMAND_MAX`), so this fits with 17
  to spare. Asserted in the script before sending; over the ceiling is a stop.

`P2B-PROOF3-TEMP` appears nowhere in the repository, the guard, the application
build or the project — so its presence in a read-back is unambiguous.

## The two writes

Both are `PATCH https://api.vercel.com/v9/projects/prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q`,
with `Authorization: Bearer <REDACTED — vcp_ project-scoped, babd0443>`,
`Content-Type: application/json`, **no `teamId`, no slug**.

**Write 1 — apply the temporary value:**

```json
{ "buildCommand": "echo P2B-PROOF3-TEMP && <preserved original, verbatim>" }
```

**Write 2 — restore:**

```json
{ "buildCommand": "<preserved original, verbatim, read from the preserved file>" }
```

Only `buildCommand` appears in either body. `rootDirectory`, `installCommand`,
`outputDirectory` and `framework` are not sent, so they cannot be altered by
omission.

## Sequence

1. Preserve everything above; verify the round-trip.
2. Capture the deployment list (for the new-deployment assertion).
3. **Write 1.**
4. `GET` the project → **prove the change**: `buildCommand` now begins
   `echo P2B-PROOF3-TEMP &&` and the other four fields are untouched.
5. `GET` the deployment list → **assert no new deployment appeared**.
6. `GET /v13/deployments/dpl_8XKM…` by its exact id → compare raw and normalized
   five fields against the preserved ones. **This is the measurement.**
7. `GET` production target and aliases → unchanged.
8. **Write 2** — restore from the preserved file.
9. `GET` the project → `buildCommand` **byte-identical** to the preserved
   original; other four unchanged.
10. `GET` the deployment again → still unchanged. `GET` target and aliases →
    unchanged.

**Restoration is part of the transaction, not a follow-up.** Once Write 1
succeeds, restoration is attempted **even if any observation in steps 4–7
fails**, and even if the script is interrupted — the runner installs an exit
trap that attempts Write 2 and verifies it.

## Status handling

| Response to a write | Meaning | Action |
|---|---|---|
| 2xx | applied | continue |
| 4xx (e.g. 403) | **definite refusal** — nothing changed | stop cleanly; on Write 1 there is nothing to restore |
| 5xx, 408, 429, timeout, dropped connection | **ambiguous** — may or may not have applied | do **not** retry blindly; `GET` the project to establish the actual value |

After an ambiguous write, the read-back decides: original value → nothing
happened, stop; temporary value → proceed to restore; **read fails or is
unreadable → `RECOVERY_REQUIRED`**.

`RECOVERY_REQUIRED` is reported when an ambiguous write cannot be resolved by
reading, or when restoration does not end with a byte-identical `buildCommand`.
It prints the preserved original so it can be restored by hand, and **no further
experiment runs** — not a retry, not another proof.

## What the result means

**Historical (expected):** the deployment's five fields are unchanged while the
project's `buildCommand` differs. Deployment-scoped settings are fixed at build
time, and reading a candidate back describes what it was built with. The
`compareBuild` check in preflight is then sound as written.

**Not historical:** the deployment's `buildCommand` follows the project's. Then a
candidate read back after any settings change describes settings it was not built
with, `compareBuild` compares against a moving value, and the receipt binding
would need to bind something the platform cannot restate. That is a finding to
report, not to fix mid-test.

Note the two forms matter here: if `rootDirectory` moves between *absent* and
`null` while nothing else changes, the raw comparison flags it and the normalized
one does not. That is worth recording rather than smoothing over.

## Stopping conditions

Stop and report; restoration is still attempted:

- the **production target** changes
- any **pre-existing alias** changes (the `with-override` preview alias already
  exists and is part of the baseline, not an addition)
- **a new deployment appears** at any point
- the deployment record's five fields change → that is the finding; restore, then stop
- any field of the deployment record other than the five changes unexpectedly
- the temporary command would exceed 256 characters
- the preserved original fails its round-trip check → stop **before** writing
- ambiguous write unresolvable by reading, or restoration not byte-identical →
  **`RECOVERY_REQUIRED`**, no further experiment

## Boundaries

No deployment creation, no promotion, no repository or branch change, no
environment-variable change, no alias operation, no custom domain, no cleanup,
no canonical resource. Exactly two writes, both to one field of one disposable
project, the second returning it to where it started.
