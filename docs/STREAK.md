# Bombe attestation streak

The streak is the on-chain attestation history itself, not a file we edit. A GitHub Action runs daily
and posts a real, deterministic attestation for each flagship asset (mETH and USDY) on Mantle Sepolia,
over live DefiLlama data. Every 7th day is a self-test that asserts a deliberately wrong value and is
correctly rejected, so the public record visibly contains VALID, REJECTED, and ABSTAIN. Misses and
abstains are kept, not hidden.

Why on-chain instead of a committed table: the chain is the durable, tamper-evident source of truth,
and it cannot be edited after the fact. A markdown mirror would add nothing a verifier should trust.

## How to read the streak

Each daily claim id is `mETH-YYYY-MM-DD` and `USDY-YYYY-MM-DD` (a self-test day appends `-selftest`).
Read any day's verdict against the AgentAttestation contract:

- Contract: `0xf2473a0a55D997233C8fBF987c197e7d2180470A` ([explorer](https://sepolia.mantlescan.xyz/address/0xf2473a0a55D997233C8fBF987c197e7d2180470A))
- Attestor (Reflector): `0x3BA08C723D41A98339D43Ffa01174791EaE813Fa`
- Read `getClaimAttestors(claimId)` then `getAttestation(claimId, attestor)`; verify by recomputing the
  reasoning hash from the trace (see the consumer quickstart in the README and `docs/INTEGRATION.md`).

## Seed transactions (2026-06-07)

The first attestations, both VALID over live data, on-chain reasoning hash equal to the local hash:

- mETH headline: attest [`0xaf3191dd…`](https://sepolia.mantlescan.xyz/tx/0xaf3191ddf53496b9196700f01221fe0b5d5d883f21af792ba5e179594984b8da)
- USDY headline: attest [`0x86fe2ceb…`](https://sepolia.mantlescan.xyz/tx/0x86fe2ceb78a52514b764dd07a17f312337b14f4a707bba5447c640491bd1440f)
- First scheduled run (GitHub Action): mETH [`0x67b76eb4…`](https://sepolia.mantlescan.xyz/tx/0x67b76eb4c0dfe9e8b067907bd265f8b01a8e56a712285097fce886d6a6bf4fc6), USDY [`0xb0f2d0bc…`](https://sepolia.mantlescan.xyz/tx/0xb0f2d0bc46013bd2a55c643b57f0f91bef5ebfb61c2835fee5edfa0ab52f1e3a)

The daily workflow is `.github/workflows/v2-streak.yml`. It pauses and alerts if the attestor balance
runs low, rather than failing silently.
