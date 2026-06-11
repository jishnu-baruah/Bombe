# Known issues

Per the v2 constitution: contracts are frozen through 2026-06-15. Any non-demo-blocking bug found in
a deployed contract is recorded here, fixed in a branch, and deployed to NEW Sepolia addresses only
after June 15. The existing deployed addresses and their attestation history stay untouched.

A demo-blocking contract bug is the only exception, and only with explicit operator approval in the
session.

## Open

(none recorded yet)

## Security follow-ups (web / operational, non-blocking)

From an adversarial security + logic audit. The high/medium code findings were fixed and
shipped (source-scheme validated before charging; SSRF host blocklist on document-check
`docUrl`; 202 on partial fulfilment). The items below are accepted residuals:

- **Operator key.** The operator API falls back to a public default (`dev-operator`) when
  `OPERATOR_KEY` is unset. Blast radius is in-memory demo state only (no on-chain effect),
  but to protect a live demo a strong `OPERATOR_KEY` is now set in Vercel production.
  Rotate it in the Vercel dashboard as needed.
- **Deploy key exposure.** `scripts/deploy-testnet.mjs` passes `DEPLOYER_KEY` to `forge`
  via `--private-key`, exposing it in the local process list / shell history. Low risk:
  it is a local operator-run script and contracts are frozen (no redeploys before
  2026-06-15). Move to a Foundry keystore (`--keystore` + `--password-file`) when the
  next redeploy is prepared.
- **Rate limiting.** No HTTP rate limiting on public endpoints. The paid `/api/v1/request`
  path is gated by a real on-chain payment per claim (economic rate limit) and dedupe is
  fail-closed via a DB unique constraint, so this is low priority for a testnet submission.

Findings refuted by the adversarial pass (no action): the "BlobSeam blocker" (dead code,
the live path stores traces in Postgres), the payment dedupe "race" (DB unique constraint
is fail-closed), and open CORS on `/request` (the endpoint is payment-authenticated).

## Resolved

(none yet)
