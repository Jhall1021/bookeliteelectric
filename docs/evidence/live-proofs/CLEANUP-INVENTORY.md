# Remaining resources, credentials and tokens

**Nothing here has been cleaned up, revoked or deleted.** This is the inventory
so cleanup can be authorized in a safe order.

## Disposable platform resources — all still live

| Resource | Identity | State |
|---|---|---|
| GitHub repository | `Price2Book/p2b-release-proofs` (id `1357368650`), private | `main` at `24a5583…`; branch `with-override` at `8dc9257…` (never merged) |
| Vercel project | `p2b-release-proofs` / `prj_al7JBBjhyxPMBGRzS9v94YEUkj4Q` | production target restored to `dpl_8uZb…`, READY |

Six deployments, all retained as evidence:

| Deployment | Target | State | What it is |
|---|---|---|---|
| `dpl_8uZbmqqKMdEZy4T26Tsw5be7Pxpf` | production | READY | import-created; **the current production target** |
| `dpl_DNdgxhTUa7zGBUTFFbEEPvNSFVSx` | production | READY | proof 1, git-push |
| `dpl_2zZVozq8asr1ZuGuXMTiFU3a3vWC` | staging | ERROR | proof 5 |
| `dpl_8XKMGsEvw33CtJbAWqL1a2Df3LwS` | production | READY | proof 4 case 1; proof 6 candidate |
| `dpl_GUWnLPTehqNmiBNQP6JvoNdEp1xj` | production | ERROR | proof 4 case 2, `SHA_NOT_MAIN` |
| `dpl_D4zqe5wVSEJjPMscXCJHs7E7camz` | preview | READY | proof 2, the override build |

Aliases: the three generated hosts all on `dpl_8uZb…`; the `with-override`
preview alias on `dpl_D4zq…`.

## Local credential files

| Path | Contents | Mode |
|---|---|---|
| `~/.p2b-live-proofs/github-token` | fine-grained PAT, `p2b-release-proofs` only, Contents:Read | `0600` in a `0700` directory |
| `~/.p2b-live-proofs/vercel-token` | `vcp_` project-scoped token, isolation-verified | `0600` in a `0700` directory |

Keep this directory out of backups.

## Platform tokens to revoke

1. **GitHub fine-grained PAT** — `Price2Book/p2b-release-proofs`, Contents:Read,
   7-day expiry from 4 Sep 2026. **This is the token that was disclosed to
   `api.vercel.com` in eight refused requests**; the operator accepted that risk
   and declined rotation, so it is still the disclosed value (fingerprint
   `ed108c10`).
2. **Vercel project-scoped token** (`vcp_`, fingerprint `babd0443`) — verified
   confined to the disposable project: production denied by id and by name.

## A safe order for cleanup, when authorized

1. **Export and verify the evidence bundle first.** Deleting the project
   destroys build logs that are not reproducible.
2. **Revoke both tokens** — after which no further reads are possible, so nothing
   should be needed from the platforms.
3. **Delete the Vercel project**, then **the GitHub repository**. Vercel first:
   the project is linked to the repository, and removing the repository first
   leaves a project pointing at nothing.
4. **Remove `~/.p2b-live-proofs/`** last.

Each step is separately authorizable and none has been taken.

## Not touched at any point

No canonical resource. `prj_zB0QVq80340s2dVt7X3c1ewKgHtT`, the `price2book.com`
hosts, `Jhall1021/bookeliteelectric` and the canonical Vercel team were never
written to, and were read only as the isolation check's denial probes — which
returned 404 by id and by name.
