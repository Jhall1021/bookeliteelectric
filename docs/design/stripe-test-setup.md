# Stripe test-mode setup — what I need from you

**29 August 2026.** The Release #3 end-to-end harness is built and refuses to
run until these exist. It also refuses a `sk_live` key outright.

I can't do these four steps: they mean signing into your Stripe dashboard,
creating an account, and entering business and bank details into an onboarding
form — including test values like `000123456789`. Those are yours to do.

Everything after them is mine.

---

## 1. A test-mode secret key

Stripe Dashboard → **Developers → API keys**, with the **Test mode** toggle on.
Copy the secret key (`sk_test_…`).

Put it in `.env` — already git-ignored, confirmed:

```
STRIPE_SECRET_KEY="sk_test_…"
```

**Never the live key.** The harness exits on `sk_live` rather than warning, but
the better protection is that it is never in the file.

## 2. A webhook signing secret for THIS environment

Local development, via the Stripe CLI:

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

It prints a `whsec_…` for that session. That value belongs to **that endpoint
in that environment**, and is a completely separate credential from the one a
deployed staging or production endpoint will have — the same separation as the
API keys themselves. A production `whsec_` in a `.env` would let a test event
verify against production, which is precisely the confusion the separation
exists to prevent.

```
STRIPE_WEBHOOK_SECRET="whsec_…"
```

## 3. A connected test account

Two ways:

- **Through the product**, which is what Release #1 was for: sign in to the
  admin, `POST /api/admin/stripe/connect`, follow the returned onboarding link.
- **From the dashboard**, in test mode, then set `stripeAccountId` on the
  contractor.

The first is better, because it proves the onboarding route works.

## 4. Finish onboarding until charges are enabled

Stripe's test onboarding accepts documented test values. Keep going until the
account reports `charges_enabled: true` — **not merely "onboarding completed"**.

Then refresh from Stripe so Price2Book records the facts rather than assuming
them:

```bash
# through the product
POST /api/admin/stripe/readiness
```

The same standard as Release #1: readiness is what Stripe last told us, and an
unanswered question is not a yes.

---

## Then I run it

```bash
npx tsx scripts/verify-deposit-live-test.ts --contractor <slug>
```

It exercises the real path — readiness → authorize → local write → capture →
webhook tenancy → `DEPOSIT_CAPTURED` → ledger — against Stripe, in test mode,
on the connected account, and cleans up after itself.

**It creates one $2.49 PaymentIntent per run**, deliberately not $249. The
thing under test is the ordering, not the figure; the figure is already proved
from contractor configuration in `verify-deposit-flow.ts`. A misconfigured run
should be a rounding error, not a charge.

**No secret reaches stdout.** Key prefixes are checked, never printed. Stripe
object ids (`pi_…`, `acct_…`) are printed because a proof you cannot correlate
with the dashboard is not much of a proof — those are identifiers, not
credentials.

---

## What stays undone until it passes

No live key. No Release #4. The two pre-work services stay unpublished, which
the internal suite checks on every run rather than trusting.
