# p2b-release-proofs

Disposable fixture for the six live release proofs. Nothing here is production
code and nothing here should outlive the proofs.

- `scripts/provenance-guard.sh` is the TEST guard: the reviewed guard with
  OWNER/REPO/REF substituted for this repository. Its identity is pinned in
  `docs/evidence/live-proofs/guard-identity.txt` in the release branch.
- `npm run build` prints `P2B-APP-BUILD-RAN` and writes `public/`. That marker
  is what makes proof 4's negative case observable: the guard runs before the
  application build, so a refusal must stop the chain before this marker appears.

Deliberately absent: `vercel.json`, `vercel.toml`, `vercel.ts`. Proof 2 adds one
on purpose, and it cannot be a pre-existing condition.
