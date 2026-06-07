# Content DNA, how Bombe explains itself

The house rules for site and public copy. Distilled from research into how production-grade, high-revenue sites (Stripe, Linear, Vercel, Resend, Supabase, Chainlink, Alchemy, Coinbase) explain complex products, plus the credibility and plain-language literature (Nielsen Norman Group, the Stanford Web Credibility Project, plainlanguage.gov, Refactoring UI, Laws of UX). It sits under the project constitution and `DESIGN.md` / `TASTE-CONTEXT.md`: where those are more specific, they win.

Bombe is a trust-and-verifiability product for a skeptical, technical audience. That makes two things matter more than usual: precision (never claim what the code does not substantiate) and one-click verifiability (the proof must be external and checkable, not a testimonial).

## The ten moves, ranked by impact

1. **Lead with the outcome, mechanism one layer down.** The headline names what you get; the subhead explains how it is true. Not "autonomous AI attestor network for RWA claims" but the payoff first, then the plumbing.
2. **Put a real, verifiable proof above the fold.** For a "verify, don't trust" product the hero proof must itself be checkable: a real on-chain attestation, the verdict, a Mantle explorer link, and the reasoning hash anyone can replay. The proof is the foreground figure; it doubles as social proof.
3. **Make the primary action "verify it yourself," not "learn more."** The strongest CTA lets a skeptic check the claim immediately. Segment secondary CTAs by audience: developers and agents go to the docs; issuers go to "attest your claims."
4. **Name your numbers.** A concrete integer beats an adjective. Attestations to date, abstain rate, claim value checked, re-verify time, bond size. Wire them to live data so they stay true; if a number is not live, do not imply it is.
5. **Translate every jargon term inline, on first use, with the "so what."** Never leave attestation, falsifiable, abstain, reasoning hash, reconcile, or consensus-over-evidence standing naked. The term and its plain gloss sit in the same sentence (see the glossary below).
6. **Show, do not tell, with the real artifact.** A real attestation and a copy-paste "re-verify this" snippet carry the claim better than prose. The check running is the entire pitch.
7. **Use a known-anchor analogy, then state its limit.** Anchor the novel category to something the reader owns ("like a credit rating for yield claims, except signed on-chain and you can re-run the math yourself"), then bound the analogy so experts are not misled.
8. **One idea per section, one idea per sentence.** Verb-led section headers, each a single promise: Claim, Attest, Sign, Re-verify. Nothing explains two things at once.
9. **Handle the two killer objections with an "even if" clause.** "AI hallucinates" and "why trust your agents" are the skeptic's first thoughts. Answer them where the reader looks for the catch: the verdict holds even if the model is wrong (the reconciler, not the model, decides Tier-1); you do not have to trust us, every verdict ships with its trace and on-chain hash.
10. **Honest limitation is the strongest trust signal.** The fact that Bombe abstains on judgment claims and only attests to falsifiable ones is the most credible thing on the site. Lead with it. Show abstentions and self-tests, not only wins. Understate; when unsure, soften or cut.

## Foreground vs background

- **Foreground** (high contrast, the eye lands here first): the one-sentence what-and-why, the single next action, and the live verifiable proof. One focal point per section.
- **Background** (low contrast, recessive, never competes with text): ambient gradient and glow (hues within ~30 degrees, low contrast), decorative motion, secondary and utility navigation, supporting metadata and fine print.
- **The squint test:** blur the page; only the headline, the CTA, and the live proof should survive. If decoration reads as prominently as content, turn it down. Never drop text contrast for aesthetics.

## Three reader depths (progressive disclosure, at most two levels)

- **5-second reader (hero):** learns what it is and why it matters from the headline plus one live proof. Heading under ~10 words.
- **30-second reader (scroll):** scans verb-led headings, one diagram, three or four proof points. The headings alone tell the story.
- **5-minute reader (detail pages):** drills into the trace, evidence values, reasoning hash, explorer links, and the tier taxonomy. Full technical depth lives here, disclosed on demand, not in the hero.

## Readability

Sentences under ~20 words on average. Active voice ("attestors verify the claim," not "the claim is verified"), which suits an agent network. Front-load the verdict before the mechanism. Everyday words; define technical terms on first reference and then reuse the same term consistently. Pronouns ("you can verify"). No typos and no broken links: for a precision product a single defect undercuts the whole claim.

## Glossary (plain-language gloss per term)

Define inline on first use; a short tooltip may repeat the gloss later. Essential meaning never lives only in a tooltip.

| Term | One-line gloss | Where |
|------|----------------|-------|
| Attestation | A signed, on-chain statement that says "we checked this claim and here is the result," which anyone can look up. | Inline first use |
| Falsifiable claim | A claim you could prove wrong with data (a yield number), not an opinion. It is the only kind Bombe will judge. | Inline (this is the thesis) |
| Abstain | When the evidence is not clear enough, the network declines to rule rather than guess. Refusing to answer is a safety feature. | Inline first use |
| Reasoning hash | A fingerprint of the agent's reasoning, stored on-chain, so anyone can prove the logic was not changed after the fact. | Inline first use; tooltip on the hash string |
| Reconcile | Cross-checking the same fact from more than one computation path and confirming they agree within an allowed margin, or else abstaining. | Inline first use |
| Consensus over evidence | Agents agree on the measured values, not on opinions, so no single model can swing a verdict. | Inline, with the "so what" spelled out |

## Constitution guardrails that override general best practice

- No em-dashes anywhere in public copy.
- No internal task IDs (T-XXX, OP-N) in the site or public docs.
- Never use the word "independent" for the mETH or USDY source pairs. mETH is "one ground truth, two computation paths." USDY is "partial independence" or single-source.
- Always show `windowDays`. Never render a short window as "30-day yield."
- Self-test claims are always flagged and visually distinguished; never let one read as a real issuer claim.
- "Live" requires real data end-to-end. When unsure, understate. Never write a claim the code does not substantiate.

## Sources

Landing and value proposition: Julian Shapiro's Startup Handbook, Harry Dry's Marketing Examples, Nielsen Norman Group homepage principles, CXL above-the-fold and value-proposition guides, Stripe's own landing-copy guide. Hierarchy and foreground/background: NN/g visual hierarchy / F-pattern / figure-ground / cognitive load, Refactoring UI, Laws of UX, Interaction Design Foundation. Production-site DNA: homepages and docs of Stripe, Linear, Vercel, Resend, Supabase, Chainlink, Alchemy, Coinbase, plus teardowns. Trust and microcopy: Stanford Web Credibility Project, NN/g credibility and microcopy articles, plainlanguage.gov and the National Archives plain-language principles, Mailchimp and Shopify Polaris content style guides.
