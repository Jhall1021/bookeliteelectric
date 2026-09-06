# Cleanup status — current, as of 5 September 2026

`CLEANUP-INVENTORY.md` is a **historical record**: it lists what existed before
cleanup and the order it was to be removed in. It is preserved byte-for-byte and
must not be read as a list of live resources. This note carries the current
status instead.

## Everything in that inventory is gone

| Resource | Status |
|---|---|
| Vercel project `p2b-release-proofs` (`prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q`) | deleted |
| GitHub repository `Price2Book/p2b-release-proofs` (id `1357368650`) | deleted |
| Vercel project-scoped token (fingerprint `babd0443`) | revoked |
| GitHub fine-grained PAT (fingerprint `ed108c10`) | revoked |
| Local `~/.p2b-live-proofs/` | removed |

All six disposable deployments went with the project.

## How this was established, and its limit

Cleanup was performed through the Vercel and GitHub dashboards, with **both
tokens revoked first** — the only ordering in which revoke-before-delete is
safe, since the deletions did not use the credentials.

**Because revocation came first, there is no post-deletion API verification and
there cannot be.** The operator's dashboard confirmation is the cleanup record.
Locally it was confirmed that `~/.p2b-live-proofs/` is gone and no `*p2b*token*`
file remains under `$HOME`.

Consequence worth stating plainly: the six live proofs cannot be re-run as they
were. Their evidence in this directory is the only remaining record of them.
