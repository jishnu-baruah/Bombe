# x402 on Mantle: existing-stack research and assembly plan

For the council, to re-decide R1 (x402) with accurate facts. The earlier v3 proposal said x402 on
Mantle was not turnkey and leaned "build a self-hosted facilitator and a token." Fresh research (npm,
GitHub, and direct on-chain RPC checks) shows the stack is mostly already there. This document is the
reusable inventory plus a concrete assembly plan. It does not change any locked decision; it gives
the council the real picture.

## What changed versus the earlier read

- **x402 is officially live on Mantle.** Mantle announced an x402 gateway via a Questflow facilitator
  partnership in October 2025. x402-on-Mantle is endorsed, not unsupported.
- **A hosted facilitator already covers Mantle Sepolia (chain 5003).** thirdweb's Nexus facilitator
  advertises any EIP-155 chain and a chain-5003 endpoint exists. Self-hosting may be unnecessary
  (confirm by querying its `/supported` with our key before relying on it).
- **The TypeScript stack is reuse-as-is.** `@x402/core`, `@x402/evm`, `@x402/hono`, `@x402/fetch` at
  v2.14.0 support any `eip155:<chainId>` chain. Bombe is Hono, so the middleware drops in.
- **A community SDK already does real x402 on Mantle mainnet:** `@puga-labs/x402-mantle-sdk` (v0.4.2),
  real EIP-3009 gasless USDC settlement, with a facilitator scaffolder. Mainnet only.
- **Mantle mainnet USDC truly supports EIP-3009** (verified on-chain: `0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9`
  runs Circle FiatTokenV2 with the canonical `transferWithAuthorization` typehashes).

## The only real "must build"

There is no EIP-3009 stablecoin on Mantle Sepolia (verified by RPC: the mainnet USDC and USDT
addresses have zero code on chain 5003; no faucet stablecoin exists). So a same-chain testnet x402
needs us to deploy our own EIP-3009 test token, which is a copy-deploy of an audited reference
(Coinbase/Centre `Token.sol`, Solidity 0.6.12, or a Solidity 0.8 ERC-3009 fork). Everything else is
reuse or configure.

## Reusable components and verdicts

| Piece | Pick | Source | Verdict |
|-------|------|--------|---------|
| Server middleware | `@x402/hono` + `@x402/core` + `@x402/evm` v2.14.0 | npm | reuse as-is; register `eip155:5003` |
| Client | `@x402/fetch` (+ `@x402/evm`, viem) v2.14.0 | npm | reuse as-is; `eip155:*` wildcard |
| Facilitator, hosted | thirdweb Nexus | `nexus-api.thirdweb.com` | configure; verify 5003 via `/supported` |
| Facilitator, self-host | `x402-rs` | github.com/x402-rs/x402-rs | configure; add one `eip155:5003` JSON block + an MNT relayer |
| EIP-3009 token (Sepolia) | Coinbase/Centre `Token.sol` | github.com/CoinbaseStablecoin/eip-3009 | copy-deploy a test stablecoin |
| Mainnet real-USDC path | `@puga-labs/x402-mantle-sdk` v0.4.2 | npm | reuse; mainnet (5000) only, real USDC `0x09bc4e0d...` |
| End-to-end template | thirdweb 402-agent-commerce | github.com/thirdweb-example/402-agent-commerce | configure; repoint network + token |

A standalone EIP-3009 token plus a facilitator does NOT touch the frozen Bombe contracts, so the
contract freeze does not block this work.

## Hackathon context (important for prioritization)

x402 is not required by the hackathon and is not specifically rewarded; the Agentic Economy track's
named tooling is the Byreal Skills CLI (Solana/Hyperliquid), unrelated to x402. So x402 is a
differentiator we choose, not a checkbox. The thematic fit (agentic economy, machine-payable APIs) is
strong, but completion and honesty matter more than ticking x402.

## Two clean paths (the decision)

1. **Sepolia, our own EIP-3009 test token (recommended).** Same chain as our attestations. Deploy the
   test token, point `@x402/hono` at thirdweb's facilitator (or self-host `x402-rs`), client uses
   `@x402/fetch`. Real settlement, testnet, no real funds, lowest infra. About a day.
2. **Mainnet, real USDC.** Most impressive (a real stablecoin), via `@puga-labs/x402-mantle-sdk` or
   `@x402/*` plus Questflow/thirdweb and the real USDC token. But it is real money and a different
   chain from where we attest, which complicates the narrative and the trust story.

## Recommended shape

Build path 1 as a clearly-labeled real x402 seam in front of `request_attestation`, alongside (not
instead of) the direct on-chain `CLAIM_FEE` path. Direct fee stays the trustless default; x402 is the
"and here is the standard agent-payment rail, working on Mantle" demo. Honest label: real x402 with
EIP-3009 settlement on Mantle Sepolia using a test stablecoin we deployed, because no stablecoin on
Sepolia implements EIP-3009 yet. Optionally show the mainnet real-USDC path as a second, clearly
real-money variant if the council wants the strongest "real settlement" wow.

## Verified uncertainties to smoke-test before the demo

1. thirdweb facilitator's explicit chain-5003 support: confirm by calling its `/supported` endpoint
   with our key (docs imply any EIP-155 chain, but it was not pinned to an explicit 5003 row).
2. Questflow's Mantle settlement specifics (mainnet vs Sepolia) are behind an access form; confirm if
   we go that route.
3. `x402-rs`'s `v2-eip155-exact` scheme against Mantle Sepolia: smoke-test verify and settle with our
   token before relying on it.
4. `@puga-labs/x402-mantle-sdk` is mainnet-only in its docs; do not assume Sepolia support.
5. The Coinbase reference token is Solidity 0.6.12; either compile with the legacy version or use a
   0.8 ERC-3009 fork to match the Foundry toolchain.

## Effort

About a day of assembly: deploy the test token, wire `@x402/hono` plus the chosen facilitator,
implement the paying client, fund an MNT relayer (if self-hosting). The genuine risks are EIP-3009
token correctness and the facilitator's custom-chain settlement, both of which want a soak test
before they go on camera, not a same-day demo.
