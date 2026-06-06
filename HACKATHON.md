# HACKATHON.md, Mantle Turing Test Hackathon 2026

Authoritative reference for **what wins** and **what we must ship**. Source: the DoraHacks
"Judging Criteria by Prize" page (<https://dorahacks.io/hackathon/mantleturingtesthackathon2026>).
The PRD (`docs/bombe-prd.md`) is the build spec; **this file is the submission spec**. Where the two
overlap, the PRD says *how to build*, this file says *what the judges require*.

> **The mandate (operator, 2026-06-06):** ship an **actual, live, on-chain product**, not a mock or
> replay-only showcase. Mock/Plugboard-replay is the *offline fallback* (T-504), never the submission
> demo. Everything the judges click must run in **live mode** against **real Mantle** with **real
> on-chain transactions**. See `MODE=live` in `.env.example`.

> **Could not fetch dates:** the DoraHacks page blocks automated fetch (HTTP 405). **Confirm the
> submission deadline and the X-voting window manually** and add them here. The **20-Project
> Deployment Award is first-come-first-served (20 spots)**, treat it as time-critical.

---

## 1. Where Bombe competes

Bombe is an autonomous **AI attestor network for real-world-asset (RWA) claims** on Mantle Sepolia.
That maps cleanly onto these prizes:

| Prize / Track | Fit | Status |
|---|---|---|
| **AI & RWA Track** (Mantle), *primary* | Path **A [Human-Driven] RWA Infrastructure**: AI-powered tooling for RWA **pricing / compliance / verification**. Bombe attests to falsifiable RWA claims with on-chain economic finality. | Strong, core thesis |
| **Grand Champion** | Cross-track. Wins on Technical Depth + Innovation; must close the Product-Completeness gap (live demo + UX). Requires nomination from ≥1 track (AI & RWA). | Targeted |
| **Best UI/UX Award** | The `/live` race view, `/leaderboard`, and `/claim/[id]` verify-hash trace viewer are the showcase surface (M5, T-6xx). | Reachable if web ships polished |
| **20-Project Deployment Award** | No judge scoring, pure checklist. Hard, time-boxed bars (see §4). | **Highest near-term priority** |
| **Community Voting** | Auto-eligible. Needs a clear demo video + shareable X presence. | Free entry; needs reach asset |

> **Not** the Agentic Economy Track (Byreal), that track requires Byreal Agent Skills / Perps CLI /
> RealClaw. Bombe uses Mantle + YieldProof, not Byreal. Skip it unless we add a Byreal integration.

---

## 2. Grand Champion scoring (overall)

| Dimension | Weight | What it rewards | Bombe's lever |
|---|---|---|---|
| Technical Depth | 30% | AI × on-chain integration, architecture completeness, code quality | 4 contracts + tiered taxonomy + slashing/disputes + agent-SDK seams + 220+ tests |
| Innovation | 25% | Originality; a **new AI × Web3 paradigm** | *Falsifiable-only* attestation; safety at the **contract layer**; **abstention** on judgment claims; external attestor (Plugboard) proves it isn't self-graded |
| Mantle Ecosystem Contribution | 25% | Substantive Mantle use + long-term value | Deployed + **verified on Mantle Explorer**; YieldProof (Mantle RWA) reference; reusable attestor primitive |
| Product Completeness | 20% | **Runnable demo**, UX, scalability | The current gap, M5 web + live deploy close it |

**Requirements:** deployed on Mantle · open-source repo + runnable demo + pitch · nominated from ≥1 track.

---

## 3. AI & RWA Track scoring (primary nomination)

- **General (60%)**, depth of AI × RWA integration · technical completeness · Mantle integration · **compliance awareness**.
- **Track-Specific (40%)**, *Infrastructure → Technical Feasibility*: completeness of the asset
  flow + innovation of the technical approach.

**"Tell us in your submission" (must answer explicitly, drafted in T-J06):**
1. **What real-world asset are we bringing on-chain?** → tokenized RWA yield/value claims
   (e.g. mETH/USDY-style yield, servicer cashflow statements) attested as Tier-1 deterministic /
   Tier-2 document-falsifiable claims.
2. **How does AI play a role?** → autonomous ReAct agents fetch oracle/feed/document evidence, reason
   under cost/step budgets, and post signed attestations (VALID/REJECTED/ABSTAIN) on-chain.
3. **How is it realized on Mantle?** → 4 contracts on Mantle Sepolia (5003); agents' inference
   results are written on-chain via `attest()`; slashing/leaderboard settle economically on Mantle.

---

## 4. 20-Project Deployment Award, the hard checklist (no judge scoring, just bars)

First 20 qualifying projects only. Each box maps to a task in `TODO.md` §T-Jxx.

**Technical Deployment**
- [ ] Smart contract deployed on **Mantle Mainnet or Testnet** → *T-804 + T-J01* (Sepolia 5003 OK).
- [ ] Contract **verified on Mantle Explorer** → *T-J02*.
- [ ] At least one **AI-powered function callable on-chain** (agent trigger / inference written
      on-chain / automated execution) → *T-J03*, our `attest()` writing an agent's decision satisfies this.

**Product Completeness**
- [ ] **Frontend demo publicly accessible (not localhost)** → *T-J04* (host on Vercel, live-wired).
- [ ] **Deployment address included in the DoraHacks submission** → *T-J06*.
- [ ] **Demo video (≥ 2 min)** walking the core use case → *T-J05*.

**Documentation**
- [ ] Open-source GitHub repo with **README** (setup, architecture overview, deployed address) → *T-805*.

> Note from the rules: *"Every requirement exists to ensure what you ship is genuinely usable, not
> just a skeleton."* This is exactly the operator mandate, **no mock-only submission.**

---

## 5. Best UI/UX scoring (secondary)

| Dimension | Weight | Notes |
|---|---|---|
| Visual Design | 30% | Aesthetic, consistency, brand identity |
| Interaction & Flow | 30% | Smooth interactions, guidance, responsiveness (incl. ≤380px, T-608) |
| AI Interaction Design | 25% | Surface AI reasoning naturally, the per-step trace + verify-hash button |
| Accessibility | 15% | Beginner-friendly; lower the Web3 barrier |

Requires a runnable frontend + demo video / public link (same artifacts as §4). The
`frontend-design` skill applies when building T-6xx.

---

## 6. Community Voting

Auto-eligible. Decided on X. **What wins:** a clear, compelling demo (even for non-technical
viewers), a solution that hits a real pain point, and shareability. Deliverable: a shareable X
thread + the demo video (T-J05). Tracked as stretch **T-J07**.

---

## 7. Requirement → task map (gap analysis)

| Judging requirement | Covered by | New work |
|---|---|---|
| Deploy on Mantle Sepolia | T-804 (`deploy:testnet`) | **T-J01** execute + record addresses |
| Verify on Mantle Explorer |, | **T-J02** |
| AI function callable on-chain | T-403 runner, T-802 wallet seam | **T-J03** capture a live attest tx |
| Public frontend (not localhost) | T-601–T-608 build the app | **T-J04** host live-wired |
| Live model / blob / wallet / DB | T-801, T-802, T-803 | (existing, must actually run live) |
| README w/ setup+arch+address | T-805 | (existing) |
| DEMO click-path | T-806 | (existing) |
| Demo video ≥2 min |, | **T-J05** |
| DoraHacks submission + pitch + "Tell us" |, | **T-J06** |
| Ship gate (deterministic, cold-start) | T-807 | (existing, but live, not just mock) |
| Community X asset |, | **T-J07** (stretch) |

The **T-Jxx** range is defined at the bottom of `TODO.md`. T-Jxx are **submission gates**, layered on
top of the PRD milestones; they do not replace M1–M8.

---

## 8. Submission checklist (final, before hitting submit on DoraHacks)

- [ ] Track nomination selected: **AI & RWA** (+ Grand Champion eligibility), T-J06
- [ ] One-line pitch written, T-J06
- [ ] "Tell us" answers (RWA type / AI role / Mantle realization), §3, T-J06
- [ ] Deployed contract addresses (all 4) listed, T-J01/T-J06
- [ ] Mantle Explorer verified links, T-J02
- [ ] Live on-chain AI-attestation tx hash as proof, T-J03
- [ ] Public frontend URL (not localhost), T-J04
- [ ] Demo video ≥2 min link, T-J05
- [ ] Open-source repo URL + README complete, T-805
- [ ] `pnpm run ci` green from a fresh clone, no creds, T-807
- [ ] Deadline confirmed and met, **operator to fill in**
