# Bombe demo + hands-on walkthrough

Two things in one doc:

1. **Try it yourself**, a step-by-step walkthrough anyone can follow on the live site to test
   every capability. No account, no keys to read; the paid step uses your own wallet.
2. **The under-three-minute video cut**, the scene order an operator records.

Live site: https://bombe-web.vercel.app · Explorer: https://sepolia.mantlescan.xyz · Chain: Mantle Sepolia (5003)

Everything below is real: live data, real on-chain transactions, a reasoning hash you can re-derive.
The verdict is always deterministic (a reconciler computes it); the model only writes the narrative.

---

## The problem (10 seconds of context)

Every tokenized yield on-chain reports a number you have to take on faith. A staking token says it
earned this much; a treasury token says it pays this much. Today you trust the dashboard. Bombe
replaces that trust with a check anyone can rerun.

---

## Try it yourself

### 1. Watch the network think, `/live`

Open **/live**. One claim is on screen at a time and the page auto-advances through four:

- **Claim A, a clean yield.** "Does mETH's reported yield actually check out?" The panel of agents
  each agree, and the verdict lands VALID. This is the normal case.
- **Claim B, a stale source.** The number matches but the feed is stale. The conservative agent
  (Reflector) abstains; the aggressive one (Rotor) commits. The panel *disagrees on purpose*, a
  panel, not a single oracle.
- **Claim C, a document that lies.** A servicer report says 50,000 USD; the bank statement sums to
  45,000. Every agent rejects it.
- **Claim D, a judgment call (the climax).** "Is this asset really worth 4.2 million dollars?" Fair
  value is an opinion, not a fact. The SDK agents abstain, and when the external attestor
  (Plugboard) tries to attest anyway, **the contract reverts it.** Blocked by protocol, not by our
  code.

Each claim reads as a plain question with a clear verdict and a one-line reason per agent. Click
**"See the on-chain reasoning"** on any claim to drop into the raw trace, sources, and hashes.

### 2. Don't trust, verify, `/verify`

Open **/verify** and paste a real claim ID: **`mETH-REQ-01122a8fa5`** (or any claim ID, reasoning
hash, or tx hash). You get the on-chain verdict (VALID), the attestor, and the **reasoning hash**.
The page re-derives the hash from the public trace and confirms it matches the on-chain value: the
verdict was not edited after the fact. No account, no keys. You can also re-derive it yourself via
`GET /api/v1/verify/mETH-REQ-01122a8fa5`.

### 3. Get an attestation, `/issuers`

Open **/issuers** and use the console. Three tabs, each returns a verdict you can verify:

- **Vault NAV (free, live):** pick an ERC-4626 vault, assert a share price, and Bombe reads the
  price straight off-chain and cross-checks it. Try sDAI
  (`0x83F20F44975D03b1b09e64809B757c47f942BEeA`, Ethereum) asserting `1.18` → VALID (the chain reads
  ~1.176); assert `2.50` → REJECTED.
- **Document (free, live):** cross-check a yield against a pinned, hashed document. The default
  checks the live US Treasury bill rate; assert `355` bps → VALID (the live figure is ~369 bps).
- **Yield (paid, on-chain):** the real thing. Connect your wallet, pay the small fee from it, and
  Bombe posts the claim, attests it on-chain, and hands you a verify link. Funds are never custodied.

### 4. Ask the assistant, the chat widget (bottom-right)

Open the chat bubble on any page. It knows the platform and can act:

- "**Verify claim `mETH-REQ-01122a8fa5`**", it calls the verify endpoint and tells you, in plain
  English, that it is VALID and that the on-chain hash matches the recomputed one.
- "**What RWA yields can I get attested?**", it recommends attestable assets from the live catalog
  (this is attestation coverage, not financial advice).
- "**What is a Tier 3 claim?**", it explains, grounded in the live capability registry, that
  judgment claims can only abstain and the contract enforces it.

### 5. Build on it, `/integrate`

Open **/integrate** for the developer path: reading and verifying an attestation is a few on-chain
view calls plus the keyless JSON API (`/api/v1/schema`, `/api/v1/assets`, `/api/v1/discover`,
`/api/v1/verify/{id}`), and there is an MCP server so an AI agent can do all of it with no human.

---

## The under-three-minute video cut

Times are guides, not hard cuts. Lead with the strongest proof; answer the skeptic on camera.

- **0:00–0:15, the problem.** The "take it on faith" framing above.
- **0:15–1:00, a live attestation (the strong proof).** On `/verify`, pull up a real mETH claim.
  "Bombe does not trust one source. It derives the yield two ways from the same on-chain ground
  truth, two computation paths, both in the trace. The verdict is deterministic: reconcile within a
  documented tolerance, then compare to the asserted value." Click verify. "The hash recomputes and
  matches. Anyone can rerun this."
- **1:00–1:25, the panel that disagrees.** On `/live`, the stale-source claim. "When a source is
  stale, the conservative agent abstains and the aggressive one commits. A panel, not one oracle.
  Refusing to answer is a feature."
- **1:25–1:50, it discriminates.** The document claim that gets REJECTED. "A tool that only ever
  says yes is a rubber stamp. This one says no when the documents disagree."
- **1:50–2:25, the climax: blocked by protocol.** The judgment claim on `/live`. "Plugboard is an
  external agent on a runtime we did not write. It tries to attest a valuation. Watch the chain
  reject it. Blocked by protocol, not by our code."
- **2:25–2:45, the assistant.** Ask the chat widget to verify a claim; it returns the plain-English
  proof. "You do not even need to read the contract; the assistant verifies for you."
- **2:45–3:00, close.** "Live on Mantle Sepolia today: real data, deterministic verdicts,
  contract-enforced abstention. Bombe turns trust me into verify it on-chain." Show the repo and the
  live URL.

---

## Honesty notes (keep these on camera and in copy)

- The verdict is deterministic; the model only narrates. Say "two computation paths," never
  "independent," for the mETH and USDY sources.
- Always show the window in days; never call a short-window figure a "30-day yield."
- A document check is only as good as the document; it does not catch a forged source.
- Testnet only, no real economic value.
