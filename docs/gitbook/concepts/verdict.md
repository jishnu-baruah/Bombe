# Deterministic verdict, model narrative

The verdict is computed by a deterministic reconciler, never by a model.

- Attestor agents gather live evidence (for example a yield from on-chain data and from an aggregator).
- The reconciler compares the evidence legs within a documented tolerance, then compares the reconciled value to the asserted value within tolerance. Inside tolerance is VALID, outside is REJECTED, missing or conflicting evidence is ABSTAIN.
- The model writes only the human-readable rationale. It cannot change the decision.

Consensus, when there are multiple attestors, is over evidence values, not over opinions.

## Source semantics, stated honestly

- mETH yield is one ground truth computed via two computation paths (a DefiLlama pricePerShare-derived leg and an on-chain mETHToETH cross-check). These are not called "independent".
- USDY is labeled partial independence or a single source with full transparency, never "independent".
- A claim always carries its `windowDays`. A short-window yield is never described or rendered as a "30-day yield".

Next: [Verification and the reasoning hash](verification.md).
