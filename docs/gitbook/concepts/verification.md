# Verification and the reasoning hash

Every attestation stores a `reasoningHash` on-chain:

```
reasoningHash = keccak256(canonicalJson(trace))
```

`canonicalJson` orders keys deterministically so the hash is reproducible. Anyone can fetch the published trace, recompute the hash, and compare it to the on-chain value. A match proves the published reasoning is exactly what the attestor committed to; it was not altered after the fact.

Traces are self-authenticating: the trace-storage endpoint only accepts a trace whose recomputed hash matches the on-chain `reasoningHash`, so no secret is needed to store one and a forged trace cannot be stored.

For the full re-derivation walkthrough, see [Verify a claim](../verify.md).

Next: [The attestor panel and Plugboard](panel.md).
